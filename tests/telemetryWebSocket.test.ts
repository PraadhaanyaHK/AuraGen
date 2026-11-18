import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, type RawData, type WebSocketServer } from "ws";
import {
  CONTRACT_VERSION,
  MAX_WEBSOCKET_MESSAGE_BYTES,
  parseServerMessage,
  type TelemetrySummary,
} from "../src/contracts.js";
import { startTelemetryWebSocketServer } from "../server/startTelemetryWebSocket.js";

const emptyCounts: TelemetrySummary["counts"] = {
  focusEvents: 0,
  blurEvents: 0,
  inputChanges: 0,
  validationErrors: 0,
  repeatedClicks: 0,
  hesitations: 0,
  prolongedUnchangedHesitations: 0,
  backtracks: 0,
  fieldSwitches: 0,
  pointerCorrections: 0,
  mouseSamples: 0,
};

function summary(
  end: number,
  counts: Partial<TelemetrySummary["counts"]> = {},
): TelemetrySummary {
  return {
    windowStart: new Date(end - 30_000).toISOString(),
    windowEnd: new Date(end).toISOString(),
    windowDurationMs: 30_000,
    counts: { ...emptyCounts, ...counts },
    metrics: {
      totalHesitationDurationMs: 0,
      averageHesitationDurationMs: 0,
    },
  };
}

function telemetryRequest(payload: TelemetrySummary, requestId = crypto.randomUUID()) {
  return {
    protocolVersion: CONTRACT_VERSION,
    requestId,
    event: "telemetry.summary",
    payload,
  };
}

function sendAndRead(socket: WebSocket, message: unknown) {
  return new Promise<ReturnType<typeof parseServerMessage>>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for WebSocket response"));
    }, 2_000);
    const onMessage = (data: RawData) => {
      clearTimeout(timer);
      try {
        resolve(parseServerMessage(data as Uint8Array));
      } catch (error) {
        reject(error);
      }
    };
    socket.once("message", onMessage);
    socket.send(JSON.stringify(message));
  });
}

describe("telemetry WebSocket integration", () => {
  let server: WebSocketServer | undefined;
  let client: WebSocket | undefined;

  afterEach(async () => {
    if (client !== undefined && client.readyState !== WebSocket.CLOSED) {
      client.close();
      await once(client, "close");
    }
    if (server !== undefined) {
      const currentServer = server;
      server = undefined;
      currentServer.close();
      await once(currentServer, "close");
    }
  });

  async function connect(now: () => number) {
    server = await startTelemetryWebSocketServer({
      host: "127.0.0.1",
      port: 0,
      now,
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Test WebSocket server did not bind to a TCP port");
    }
    client = new WebSocket(`ws://127.0.0.1:${address.port}/telemetry`);
    await once(client, "open");
    return client;
  }

  it("returns a correlated low score for a normal aggregate summary", async () => {
    const now = 1_000_000;
    const socket = await connect(() => now);
    const request = telemetryRequest(summary(now));
    const response = await sendAndRead(socket, request);

    expect(response).toMatchObject({
      protocolVersion: CONTRACT_VERSION,
      requestId: request.requestId,
      event: "friction.score",
      payload: {
        level: "low",
        score: 0,
        eligibleForAdaptation: false,
        triggerEligibility: { automatic: false },
      },
    });
  });

  it("returns high scores and triggers only after consecutive qualifying windows", async () => {
    let now = 1_000_000;
    const socket = await connect(() => now);
    const highCounts = {
      validationErrors: 2,
      repeatedClicks: 2,
      prolongedUnchangedHesitations: 2,
      backtracks: 2,
      fieldSwitches: 8,
      pointerCorrections: 10,
      mouseSamples: 10,
    };

    const first = await sendAndRead(
      socket,
      telemetryRequest(summary(now, highCounts)),
    );
    expect(first).toMatchObject({
      event: "friction.score",
      payload: {
        level: "high",
        eligibleForAdaptation: false,
        triggerEligibility: { automatic: false },
      },
    });

    now += 30_000;
    const second = await sendAndRead(
      socket,
      telemetryRequest(summary(now, highCounts)),
    );
    expect(second).toMatchObject({
      event: "friction.score",
      payload: {
        level: "high",
        eligibleForAdaptation: true,
        triggerEligibility: { automatic: true },
      },
    });

    now += 30_000;
    const afterTrigger = await sendAndRead(
      socket,
      telemetryRequest(summary(now, highCounts)),
    );
    expect(afterTrigger).toMatchObject({
      event: "friction.score",
      payload: {
        eligibleForAdaptation: false,
        triggerEligibility: {
          automatic: false,
          blockers: expect.arrayContaining(["cooldown-active"]),
        },
      },
    });
  });

  it("does not allow pointer-only summaries to trigger adaptation", async () => {
    let now = 1_000_000;
    const socket = await connect(() => now);
    const pointerOnly = {
      pointerCorrections: 10,
      mouseSamples: 10,
    };
    await sendAndRead(socket, telemetryRequest(summary(now, pointerOnly)));

    now += 30_000;
    const response = await sendAndRead(
      socket,
      telemetryRequest(summary(now, pointerOnly)),
    );
    expect(response).toMatchObject({
      event: "friction.score",
      payload: {
        eligibleForAdaptation: false,
        triggerEligibility: {
          automatic: false,
          blockers: expect.arrayContaining(["score-below-high"]),
        },
      },
    });
  });

  it("rejects malformed, oversized, and stale messages", async () => {
    const now = 1_000_000;
    const socket = await connect(() => now);
    const malformed = await sendAndRead(socket, {
      protocolVersion: CONTRACT_VERSION,
      requestId: "not-a-uuid",
      event: "telemetry.summary",
      payload: {},
    });
    expect(malformed).toMatchObject({
      event: "error",
      payload: { code: "INVALID_MESSAGE" },
    });

    const stale = await sendAndRead(
      socket,
      telemetryRequest(summary(now - 60_001)),
    );
    expect(stale).toMatchObject({
      event: "error",
      payload: { code: "INVALID_TELEMETRY" },
    });

    const closed = once(socket, "close");
    socket.send("x".repeat(MAX_WEBSOCKET_MESSAGE_BYTES + 1));
    const [code] = await closed;
    expect(code).toBe(1009);
  });

  it("rejects a repeated request ID without scoring the request twice", async () => {
    const now = 1_000_000;
    const socket = await connect(() => now);
    const request = telemetryRequest(summary(now));
    expect((await sendAndRead(socket, request)).event).toBe("friction.score");
    expect(await sendAndRead(socket, request)).toMatchObject({
      event: "error",
      payload: { code: "INVALID_MESSAGE" },
    });
  });
});
