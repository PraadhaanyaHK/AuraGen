// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAdaptationTriggerState,
  evaluateAdaptationTrigger,
  scoreInteractionFriction,
} from "../src/friction.js";
import type { TelemetrySummary } from "../src/contracts.js";
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
    unmount();
  });
});
