import { useEffect, useRef, useState } from "react";
import {
  CONTRACT_VERSION,
  MessageInputError,
  parseServerMessage,
  ADAPTIVE_UI_SCHEMA_VERSION,
  FINANCIAL_FORM_METADATA,
  type FrictionScoreResponse,
  type TelemetrySummary,
  type AdaptiveUiPlan,
} from "./contracts.js";
import { TELEMETRY_SUMMARY_INTERVAL_MS } from "./telemetry.js";

export type TelemetryConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected";

const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
const RESPONSE_TIMEOUT_MS = 15_000;
const GENERATION_RESPONSE_TIMEOUT_MS = 35_000;
const DEFAULT_TELEMETRY_WS_URL = "ws://127.0.0.1:8081/telemetry";

export type AdaptationPlanResponse = {
  requestId: string;
  plan: AdaptiveUiPlan;
};

function createRequestId(): string {
  return globalThis.crypto.randomUUID();
}

function getResponseEnvelope(data: unknown): {
  event?: unknown;
  requestId?: unknown;
} {
  if (typeof data !== "string") {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }
    const envelope = parsed as { event?: unknown; requestId?: unknown };
    return { event: envelope.event, requestId: envelope.requestId };
  } catch {
    return {};
  }
}

export function useTelemetrySocket(summary: TelemetrySummary): {
  connectionStatus: TelemetryConnectionStatus;
  frictionResponse: FrictionScoreResponse | null;
  adaptationPlan: AdaptationPlanResponse | null;
  generationError: string | null;
  cancelPendingAdaptation: () => void;
  sendAdaptationRequest: (
    friction: FrictionScoreResponse,
    consecutiveHighWindows: number,
    presentationMode: "original" | "wizard",
    activePlan: AdaptiveUiPlan,
  ) => boolean;
} {
  const summaryRef = useRef(summary);
  summaryRef.current = summary;
  const [connectionStatus, setConnectionStatus] =
    useState<TelemetryConnectionStatus>("connecting");
  const [frictionResponse, setFrictionResponse] =
    useState<FrictionScoreResponse | null>(null);
  const [adaptationPlan, setAdaptationPlan] =
    useState<AdaptationPlanResponse | null>(null);
  const [generationError, setGenerationError] =
    useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingTelemetryRequestRef = useRef<string | null>(null);
  const telemetryResponseTimerRef = useRef<number | undefined>(undefined);
  const pendingAdaptationRequestRef = useRef<string | null>(null);
  const latestAdaptationRequestRef = useRef<string | null>(null);
  const adaptationResponseTimerRef = useRef<number | undefined>(undefined);
  const cancelPendingAdaptation = () => {
    pendingTelemetryRequestRef.current = null;
    if (telemetryResponseTimerRef.current !== undefined) {
      window.clearTimeout(telemetryResponseTimerRef.current);
      telemetryResponseTimerRef.current = undefined;
    }
    pendingAdaptationRequestRef.current = null;
    latestAdaptationRequestRef.current = null;
    if (adaptationResponseTimerRef.current !== undefined) {
      window.clearTimeout(adaptationResponseTimerRef.current);
      adaptationResponseTimerRef.current = undefined;
    }
    setAdaptationPlan(null);
    setGenerationError(null);
  };

  const sendAdaptationRequest = (
    friction: FrictionScoreResponse,
    consecutiveHighWindows: number,
    presentationMode: "original" | "wizard",
    activePlan: AdaptiveUiPlan,
  ): boolean => {
    const socket = socketRef.current;
    if (pendingAdaptationRequestRef.current !== null) {
      return false;
    }
    if (socket === null || socket.readyState !== WebSocket.OPEN) {
      setGenerationError("The backend is unavailable. The original form is unchanged.");
      return false;
    }

    const independentSignal =
      friction.observedSignals.includes("validation-errors")
        ? "validation-errors"
        : friction.observedSignals.includes("repeated-clicks")
          ? "repeated-clicks"
          : friction.observedSignals.includes("backtracking")
            ? "backtracking"
            : null;
    if (independentSignal === null) {
      return false;
    }

    const requestId = createRequestId();
    pendingAdaptationRequestRef.current = requestId;
    latestAdaptationRequestRef.current = requestId;
    setAdaptationPlan(null);
    setGenerationError(null);
    try {
      socket.send(
        JSON.stringify({
          protocolVersion: CONTRACT_VERSION,
          requestId,
          event: "adaptation.request",
          payload: {
            schemaVersion: ADAPTIVE_UI_SCHEMA_VERSION,
            form: FINANCIAL_FORM_METADATA,
            telemetry: summaryRef.current,
            friction,
            consecutiveHighWindows,
            independentSignal,
            presentationMode,
            previousPlan: {
              title: activePlan.title,
              stepTitles: activePlan.steps.map((step) => step.title),
            },
          },
        }),
      );
      adaptationResponseTimerRef.current = window.setTimeout(() => {
        if (pendingAdaptationRequestRef.current === requestId) {
          pendingAdaptationRequestRef.current = null;
          latestAdaptationRequestRef.current = null;
          adaptationResponseTimerRef.current = undefined;
          setGenerationError("Live plan generation timed out.");
        }
      }, GENERATION_RESPONSE_TIMEOUT_MS);
      return true;
    } catch {
      pendingAdaptationRequestRef.current = null;
      latestAdaptationRequestRef.current = null;
      setGenerationError("The backend is unavailable. The original form is unchanged.");
      return false;
    }
  };

  useEffect(() => {
    const socketUrl =
      import.meta.env.VITE_TELEMETRY_WS_URL || DEFAULT_TELEMETRY_WS_URL;
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let connectionStabilityTimer: number | undefined;
    let reconnectAttempt = 0;

    const clearPendingRequest = () => {
      pendingTelemetryRequestRef.current = null;
      if (telemetryResponseTimerRef.current !== undefined) {
        window.clearTimeout(telemetryResponseTimerRef.current);
        telemetryResponseTimerRef.current = undefined;
      }
    };

    const connect = () => {
      if (disposed) {
        return;
      }
      setConnectionStatus("connecting");
      try {
        socket = new WebSocket(socketUrl);
        socketRef.current = socket;
      } catch {
        console.warn("Unable to open telemetry WebSocket");
        setConnectionStatus("disconnected");
        scheduleReconnect();
        return;
      }

      const activeSocket = socket;
      activeSocket.addEventListener("open", () => {
        if (disposed || socket !== activeSocket) {
          return;
        }
        if (connectionStabilityTimer !== undefined) {
          window.clearTimeout(connectionStabilityTimer);
        }
        connectionStabilityTimer = window.setTimeout(() => {
          reconnectAttempt = 0;
          connectionStabilityTimer = undefined;
        }, 10_000);
        setConnectionStatus("connected");
        console.debug("Telemetry WebSocket connected");
      });

      activeSocket.addEventListener(
        "message",
        (event: MessageEvent<unknown>) => {
          if (disposed || socket !== activeSocket) {
            return;
          }
          try {
            if (typeof event.data !== "string") {
              throw new MessageInputError(
                "INVALID_MESSAGE",
                "Server message must be text",
              );
            }
            const message = parseServerMessage(event.data);
            if (
              message.requestId !== pendingTelemetryRequestRef.current &&
              message.requestId !== pendingAdaptationRequestRef.current
            ) {
              console.debug("Ignoring stale telemetry response");
              return;
            }
            if (message.event === "friction.score") {
              if (message.requestId !== pendingTelemetryRequestRef.current) {
                return;
              }
              clearPendingRequest();
              setFrictionResponse(message.payload);
            } else if (message.event === "adaptation.plan") {
              if (message.requestId !== latestAdaptationRequestRef.current) {
                return;
              }
              pendingAdaptationRequestRef.current = null;
              if (adaptationResponseTimerRef.current !== undefined) {
                window.clearTimeout(adaptationResponseTimerRef.current);
                adaptationResponseTimerRef.current = undefined;
              }
              setGenerationError(null);
              setAdaptationPlan({
                requestId: message.requestId,
                plan: message.payload,
              });
            } else if (message.event === "error") {
              if (message.requestId === latestAdaptationRequestRef.current) {
                pendingAdaptationRequestRef.current = null;
                latestAdaptationRequestRef.current = null;
                if (adaptationResponseTimerRef.current !== undefined) {
                  window.clearTimeout(adaptationResponseTimerRef.current);
                  adaptationResponseTimerRef.current = undefined;
                }
                setGenerationError(message.payload.message);
              }
              console.warn("WebSocket request rejected", {
                code: message.payload.code,
                retryable: message.payload.retryable,
              });
            }
          } catch (error) {
            const envelope = getResponseEnvelope(event.data);
            if (
              envelope.event === "adaptation.plan" &&
              envelope.requestId === latestAdaptationRequestRef.current
            ) {
              pendingAdaptationRequestRef.current = null;
              latestAdaptationRequestRef.current = null;
              if (adaptationResponseTimerRef.current !== undefined) {
                window.clearTimeout(adaptationResponseTimerRef.current);
                adaptationResponseTimerRef.current = undefined;
              }
              setGenerationError(
                "The adaptive plan was invalid. The original form is unchanged.",
              );
            }
            console.warn(
              "Ignoring invalid telemetry server message",
              error instanceof MessageInputError
                ? error.code
                : "INVALID_MESSAGE",
            );
          }
        },
      );

      activeSocket.addEventListener("error", () => {
        if (!disposed && socket === activeSocket) {
          console.debug("Telemetry WebSocket transport error");
        }
      });

      activeSocket.addEventListener("close", () => {
        if (disposed || socket !== activeSocket) {
          return;
        }
        socket = null;
        socketRef.current = null;
        if (connectionStabilityTimer !== undefined) {
          window.clearTimeout(connectionStabilityTimer);
          connectionStabilityTimer = undefined;
        }
        clearPendingRequest();
        const generationWasPending =
          pendingAdaptationRequestRef.current !== null;
        pendingAdaptationRequestRef.current = null;
        latestAdaptationRequestRef.current = null;
        if (adaptationResponseTimerRef.current !== undefined) {
          window.clearTimeout(adaptationResponseTimerRef.current);
          adaptationResponseTimerRef.current = undefined;
        }
        if (generationWasPending) {
          setGenerationError(
            "The backend disconnected during generation. The original form is unchanged.",
          );
        }
        setConnectionStatus("disconnected");
        console.debug("Telemetry WebSocket disconnected");
        scheduleReconnect();
      });
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== undefined) {
        return;
      }
      const delay = Math.min(
        RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt,
        RECONNECT_MAX_DELAY_MS,
      );
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, delay);
      console.debug("Telemetry service reconnect scheduled", { delay });
    };

    connect();
    const summaryTimer = window.setInterval(() => {
      if (socket === null || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      if (pendingTelemetryRequestRef.current !== null) {
        console.debug("Skipping telemetry send while a response is pending");
        return;
      }

      const requestId = createRequestId();
      try {
        socket.send(
          JSON.stringify({
            protocolVersion: CONTRACT_VERSION,
            requestId,
            event: "telemetry.summary",
            payload: summaryRef.current,
          }),
        );
        pendingTelemetryRequestRef.current = requestId;
        telemetryResponseTimerRef.current = window.setTimeout(() => {
          if (pendingTelemetryRequestRef.current === requestId) {
            clearPendingRequest();
            console.debug("Telemetry response timed out");
          }
        }, RESPONSE_TIMEOUT_MS);
      } catch {
        console.warn("Unable to send telemetry summary");
      }
    }, TELEMETRY_SUMMARY_INTERVAL_MS);

    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
      }
      if (connectionStabilityTimer !== undefined) {
        window.clearTimeout(connectionStabilityTimer);
      }
      if (summaryTimer !== undefined) {
        window.clearInterval(summaryTimer);
      }
      clearPendingRequest();
      socketRef.current = null;
      pendingAdaptationRequestRef.current = null;
      latestAdaptationRequestRef.current = null;
      if (adaptationResponseTimerRef.current !== undefined) {
        window.clearTimeout(adaptationResponseTimerRef.current);
        adaptationResponseTimerRef.current = undefined;
      }
      socket?.close();
      socket = null;
    };
  }, []);

  return {
    connectionStatus,
    frictionResponse,
    adaptationPlan,
    generationError,
    cancelPendingAdaptation,
    sendAdaptationRequest,
  };
}
