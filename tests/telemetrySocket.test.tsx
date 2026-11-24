// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAdaptationTriggerState,
  evaluateAdaptationTrigger,
  scoreInteractionFriction,
} from "../src/friction.js";
import type {
  FrictionScoreResponse,
  TelemetrySummary,
} from "../src/contracts.js";
import { createFallbackAdaptiveUiPlan } from "../src/adaptivePlan.js";
import { TELEMETRY_SUMMARY_INTERVAL_MS } from "../src/telemetry.js";
import { useTelemetrySocket } from "../src/telemetrySocket.js";

type MockListener = EventListener | EventListenerObject;

class MockWebSocket {
  static readonly OPEN = 1;
  static instances: MockWebSocket[] = [];

  readyState = 0;
  sent: string[] = [];
  private readonly listeners = new Map<string, Set<MockListener>>();

  constructor() {
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: MockListener): void {
    const listeners = this.listeners.get(type) ?? new Set<MockListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  send(message: string): void {
    this.sent.push(message);
  }

  close(): void {
    this.readyState = 3;
    this.emit("close", new Event("close"));
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.emit("open", new Event("open"));
  }

  receive(message: unknown): void {
    this.emit(
      "message",
      new MessageEvent("message", { data: JSON.stringify(message) }),
    );
  }

  private emit(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === "function") {
        listener(event);
      } else {
        listener.handleEvent(event);
      }
    }
  }
}

const emptySummary: TelemetrySummary = {
  windowStart: "2026-11-18T10:00:00.000Z",
  windowEnd: "2026-11-18T10:00:30.000Z",
  windowDurationMs: 30_000,
  counts: {
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
  },
  metrics: {
    totalHesitationDurationMs: 0,
    averageHesitationDurationMs: 0,
  },
};

const scoreResponse = evaluateAdaptationTrigger(
  emptySummary,
  scoreInteractionFriction(emptySummary),
  createAdaptationTriggerState(),
  Date.parse(emptySummary.windowEnd),
).scoreResponse;
const eligibleFrictionResponse: FrictionScoreResponse = {
  ...scoreResponse,
  level: "high",
  observedSignals: ["validation-errors"],
  eligibleForAdaptation: true,
  triggerEligibility: {
    ...scoreResponse.triggerEligibility,
    automatic: true,
    manual: true,
    blockers: [],
  },
};

const receiveAdaptationError = (
  socket: MockWebSocket,
  requestId: string,
  code: "GENERATION_FAILED" | "INVALID_ADAPTATION_REQUEST",
  retryable: boolean,
) =>
  socket.receive({
    protocolVersion: "1.1",
    requestId,
    event: "error",
    payload: {
      code,
      message: "The request was rejected.",
      retryable,
    },
  });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  MockWebSocket.instances = [];
});

describe("telemetry WebSocket client", () => {
  it("sends aggregate summaries on cadence without overlapping pending requests", () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);
    let requestSequence = 0;
    vi.stubGlobal("crypto", {
      randomUUID: () =>
        `00000000-0000-4000-8000-${String(++requestSequence).padStart(12, "0")}`,
    });

    const { unmount } = renderHook(() => useTelemetrySocket(emptySummary));
    const socket = MockWebSocket.instances[0]!;
    act(() => socket.open());
    act(() => vi.advanceTimersByTime(TELEMETRY_SUMMARY_INTERVAL_MS));

    expect(socket.sent).toHaveLength(1);
    const sent = JSON.parse(socket.sent[0]!) as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual([
      "event",
      "payload",
      "protocolVersion",
      "requestId",
    ]);
    expect(sent.event).toBe("telemetry.summary");
    expect(sent.payload).toEqual(emptySummary);

    act(() => vi.advanceTimersByTime(TELEMETRY_SUMMARY_INTERVAL_MS));
    expect(socket.sent).toHaveLength(1);

    act(() =>
      socket.receive({
        protocolVersion: "1.1",
        requestId: sent.requestId,
        event: "friction.score",
        payload: scoreResponse,
      }),
    );
    act(() => vi.advanceTimersByTime(TELEMETRY_SUMMARY_INTERVAL_MS));
    expect(socket.sent).toHaveLength(2);
    unmount();
  });

  it("ignores stale connection responses and reconnects after disconnection", () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubGlobal("crypto", {
      randomUUID: () => "00000000-0000-4000-8000-000000000001",
    });

    const { result, unmount } = renderHook(() =>
      useTelemetrySocket(emptySummary),
    );
    const firstSocket = MockWebSocket.instances[0]!;
    act(() => firstSocket.open());
    act(() => firstSocket.close());
    expect(result.current.connectionStatus).toBe("disconnected");

    act(() => vi.advanceTimersByTime(1_000));
    const secondSocket = MockWebSocket.instances[1]!;
    expect(result.current.connectionStatus).toBe("connecting");
    act(() => secondSocket.open());
    expect(result.current.connectionStatus).toBe("connected");

    act(() => {
      firstSocket.receive({
        protocolVersion: "1.1",
        requestId: "00000000-0000-4000-8000-000000000001",
        event: "friction.score",
        payload: scoreResponse,
      });
    });
    expect(result.current.frictionResponse).toBeNull();
    act(() => secondSocket.close());
    act(() => vi.advanceTimersByTime(1_000));
    expect(MockWebSocket.instances).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1_000));
    expect(MockWebSocket.instances).toHaveLength(3);
    unmount();
  });

  it("sends an eligible adaptation using an independent signal from the score response", () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubGlobal("crypto", {
      randomUUID: () => "00000000-0000-4000-8000-000000000001",
    });

    const highSummary: TelemetrySummary = {
      ...emptySummary,
      counts: {
        ...emptySummary.counts,
        validationErrors: 2,
        repeatedClicks: 2,
        prolongedUnchangedHesitations: 2,
        backtracks: 2,
        fieldSwitches: 8,
        mouseSamples: 10,
      },
    };
    const firstState = createAdaptationTriggerState();
    const highResult = evaluateAdaptationTrigger(
      highSummary,
      scoreInteractionFriction(highSummary),
      firstState,
      Date.parse(highSummary.windowEnd),
    );
    const eligible = {
      ...highResult.scoreResponse,
      level: "high" as const,
      eligibleForAdaptation: true,
      triggerEligibility: {
        ...highResult.scoreResponse.triggerEligibility,
        automatic: true,
        blockers: [],
      },
    };

    const { result, unmount } = renderHook(() =>
      useTelemetrySocket(emptySummary),
    );
    const socket = MockWebSocket.instances[0]!;
    act(() => socket.open());

    let sent = false;
    act(() => {
      sent = result.current.sendAdaptationRequest(
        eligible,
        2,
        "wizard",
        createFallbackAdaptiveUiPlan(),
      );
    });
    expect(sent).toBe(true);
    expect(JSON.parse(socket.sent.at(-1)!)).toMatchObject({
      event: "adaptation.request",
      payload: {
        consecutiveHighWindows: 2,
        independentSignal: "validation-errors",
      },
    });
    unmount();
  });

  it("prevents duplicate generation and ignores a response after cancellation", () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubGlobal("crypto", {
      randomUUID: () => "00000000-0000-4000-8000-000000000001",
    });
    const { result, unmount } = renderHook(() =>
      useTelemetrySocket(emptySummary),
    );
    const socket = MockWebSocket.instances[0]!;
    act(() => socket.open());
    let firstRequestAccepted = false;
    let duplicateAccepted = true;
    act(() => {
      firstRequestAccepted = result.current.sendAdaptationRequest(
        eligibleFrictionResponse,
        2,
        "original",
        createFallbackAdaptiveUiPlan(),
      );
      duplicateAccepted = result.current.sendAdaptationRequest(
        eligibleFrictionResponse,
        2,
        "original",
        createFallbackAdaptiveUiPlan(),
      );
    });
    expect(firstRequestAccepted).toBe(true);
    expect(duplicateAccepted).toBe(false);
    expect(socket.sent).toHaveLength(1);
    const requestId = JSON.parse(socket.sent[0]!).requestId as string;
    act(() => result.current.cancelAdaptationRequest());
    act(() =>
      socket.receive({
        protocolVersion: "1.1",
        requestId,
        event: "adaptation.plan",
        payload: createFallbackAdaptiveUiPlan(),
      }),
    );
    expect(result.current.adaptationPlan).toBeNull();
    expect(result.current.generationError).toBeNull();
    unmount();
  });

  it("rejects a response from an earlier request after a newer request starts", () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    let requestSequence = 0;
    vi.stubGlobal("crypto", {
      randomUUID: () =>
        `00000000-0000-4000-8000-${String(++requestSequence).padStart(12, "0")}`,
    });
    const { result, unmount } = renderHook(() =>
      useTelemetrySocket(emptySummary),
    );
    const socket = MockWebSocket.instances[0]!;
    act(() => socket.open());
    act(() => {
      result.current.sendAdaptationRequest(
        eligibleFrictionResponse,
        2,
        "original",
        createFallbackAdaptiveUiPlan(),
      );
    });
    const firstId = JSON.parse(socket.sent[0]!).requestId as string;
    const fallbackPlan = createFallbackAdaptiveUiPlan();
    act(() =>
      socket.receive({
        protocolVersion: "1.1",
        requestId: firstId,
        event: "adaptation.plan",
        payload: fallbackPlan,
      }),
    );
    expect(result.current.adaptationPlan?.requestId).toBe(firstId);

    act(() => {
      result.current.sendAdaptationRequest(
        eligibleFrictionResponse,
        2,
        "wizard",
        fallbackPlan,
      );
    });
    const secondId = JSON.parse(socket.sent[1]!).requestId as string;
    act(() =>
      socket.receive({
        protocolVersion: "1.1",
        requestId: firstId,
        event: "adaptation.plan",
        payload: fallbackPlan,
      }),
    );
    expect(result.current.adaptationPlan).toBeNull();

    act(() =>
      socket.receive({
        protocolVersion: "1.1",
        requestId: secondId,
        event: "adaptation.plan",
        payload: fallbackPlan,
      }),
    );
    expect(result.current.adaptationPlan?.requestId).toBe(secondId);
    unmount();
  });

  it("reports backend unavailability and disconnects without failing the form hook", () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubGlobal("crypto", {
      randomUUID: () => "00000000-0000-4000-8000-000000000001",
    });
    const { result, unmount } = renderHook(() =>
      useTelemetrySocket(emptySummary),
    );
    let sent = true;
    act(() => {
      sent = result.current.sendAdaptationRequest(
        eligibleFrictionResponse,
        2,
        "original",
        createFallbackAdaptiveUiPlan(),
      );
    });
    expect(sent).toBe(false);
    expect(result.current.generationError).toMatch(/backend is unavailable/i);

    const socket = MockWebSocket.instances[0]!;
    act(() => socket.open());
    act(() => {
      result.current.cancelAdaptationRequest();
      result.current.sendAdaptationRequest(
        eligibleFrictionResponse,
        2,
        "original",
        createFallbackAdaptiveUiPlan(),
      );
      socket.close();
    });
    expect(result.current.connectionStatus).toBe("disconnected");
    expect(result.current.generationError).toMatch(/backend disconnected/i);
    unmount();
  });

  it("reports a rejected generation request and an invalid plan response", () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    let requestSequence = 0;
    vi.stubGlobal("crypto", {
      randomUUID: () =>
        `00000000-0000-4000-8000-${String(++requestSequence).padStart(12, "0")}`,
    });
    const { result, unmount } = renderHook(() =>
      useTelemetrySocket(emptySummary),
    );
    const socket = MockWebSocket.instances[0]!;
    act(() => socket.open());
    act(() => {
      result.current.sendAdaptationRequest(
        eligibleFrictionResponse,
        2,
        "original",
        createFallbackAdaptiveUiPlan(),
      );
    });
    let requestId = JSON.parse(socket.sent[0]!).requestId as string;
    act(() =>
      receiveAdaptationError(
        socket,
        requestId,
        "INVALID_ADAPTATION_REQUEST",
        false,
      ),
    );
    expect(result.current.generationError).toBe("The request was rejected.");

    act(() => {
      result.current.sendAdaptationRequest(
        eligibleFrictionResponse,
        2,
        "original",
        createFallbackAdaptiveUiPlan(),
      );
    });
    requestId = JSON.parse(socket.sent[1]!).requestId as string;
    act(() =>
      socket.receive({
        protocolVersion: "1.1",
        requestId,
        event: "adaptation.plan",
        payload: { schemaVersion: "1.0", steps: [] },
      }),
    );
    expect(result.current.generationError).toMatch(/adaptive plan was invalid/i);
    expect(result.current.adaptationPlan).toBeNull();
    unmount();
  });
});
