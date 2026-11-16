import { once } from "node:events";
import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import {
  FIELD_IDS,
  FINANCIAL_FORM_METADATA,
  validateAdaptiveUiPlan,
} from "../src/contracts.js";
import { createApiServer, type ApiServer } from "../server/api.js";
import {
  generateUiPlan,
  InvalidGeneratedPlanError,
  InvalidGenerationRequestError,
  type UiPlanGenerationProvider,
} from "../server/generation.js";
import { malformedPlans } from "./fixtures/malformedPlans.js";

const validGenerationRequest = {
  metadata: FINANCIAL_FORM_METADATA,
  frictionReasons: ["validation-errors", "hesitations"],
};

let server: ApiServer;
let baseUrl: string;

async function listen(apiServer: ApiServer): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    apiServer.httpServer.once("error", reject);
    apiServer.httpServer.listen(0, "127.0.0.1", resolve);
  });
  const address = apiServer.httpServer.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function stopServer(apiServer: ApiServer): Promise<void> {
  apiServer.webSocketServer.close();
  await new Promise<void>((resolve, reject) => {
    apiServer.httpServer.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function connectWebSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  await once(socket, "open");
  return socket;
}

beforeEach(async () => {
  server = createApiServer();
  baseUrl = await listen(server);
});

afterEach(async () => {
  await stopServer(server);
});

describe("mock-first backend", () => {
  it("serves a healthy API and returns a validated deterministic plan", async () => {
    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });

    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validGenerationRequest),
    });
    expect(response.status).toBe(200);
    const plan: unknown = await response.json();
    expect(
      validateAdaptiveUiPlan(plan).steps.flatMap(({ fieldIds }) => fieldIds),
    ).toEqual(FIELD_IDS);
  });

  it("rejects form values and other unapproved generation input", async () => {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...validGenerationRequest,
        values: { employmentStatus: "must not be accepted" },
      }),
    });
    expect(response.status).toBe(400);

    await expect(
      generateUiPlan({
        ...validGenerationRequest,
        metadata: {
          ...FINANCIAL_FORM_METADATA,
          values: { requestedLoanAmount: 1 },
        },
      }),
    ).rejects.toBeInstanceOf(InvalidGenerationRequestError);
  });

  it("rejects malformed provider plans before returning them", async () => {
    const provider: UiPlanGenerationProvider = {
      generatePlan: async () => malformedPlans.duplicateField,
    };
    await expect(
      generateUiPlan(validGenerationRequest, provider),
    ).rejects.toBeInstanceOf(InvalidGeneratedPlanError);

    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...validGenerationRequest,
        unexpected: true,
      }),
    });
    expect(response.status).toBe(400);
  });

  it("validates WebSocket messages and enforces the frame-size limit", async () => {
    const handled = vi.fn();
    await stopServer(server);
    server = createApiServer({ onClientMessage: handled });
    baseUrl = await listen(server);
    const wsUrl = baseUrl.replace("http:", "ws:") + "/ws";
    const socket = await connectWebSocket(wsUrl);
    const message = {
      protocolVersion: "1.0",
      requestId: "9b530ef4-3c39-4bdb-93ef-5790bcf6c0d5",
      event: "telemetry.summary",
      payload: {
        windowStart: "2026-11-12T10:00:00.000Z",
        windowEnd: "2026-11-12T10:00:30.000Z",
        windowDurationMs: 30_000,
        counts: {
          focusEvents: 0,
          blurEvents: 0,
          inputChanges: 0,
          validationErrors: 0,
          repeatedClicks: 0,
          hesitations: 0,
          backtracks: 0,
          fieldSwitches: 0,
          pointerCorrections: 0,
          mouseSamples: 0,
        },
        metrics: {
          totalHesitationDurationMs: 0,
          averageHesitationDurationMs: 0,
        },
      },
    };
    socket.send(JSON.stringify(message));
    await vi.waitFor(() => expect(handled).toHaveBeenCalledOnce());
    expect(handled.mock.calls[0]?.[0]).toEqual(message);
    const socketClosed = once(socket, "close");
    socket.close();
    await socketClosed;

    const oversizedSocket = await connectWebSocket(wsUrl);
    const oversizedClosed = once(oversizedSocket, "close");
    oversizedSocket.send("x".repeat(16 * 1024 + 1));
    const [code] = (await oversizedClosed) as [number];
    expect(code).toBe(1009);
  });
});
