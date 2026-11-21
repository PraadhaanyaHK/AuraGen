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
const DEFAULT_TELEMETRY_WS_URL = "ws://127.0.0.1:8081/telemetry";

function createRequestId(): string {
  return globalThis.crypto.randomUUID();
}

export function useTelemetrySocket(summary: TelemetrySummary): {
  connectionStatus: TelemetryConnectionStatus;
  frictionResponse: FrictionScoreResponse | null;
  adaptationPlan: AdaptiveUiPlan | null;
  generationError: string | null;
  sendAdaptationRequest: (
    friction: FrictionScoreResponse,
    consecutiveHighWindows: number,
  ) => boolean;
} {
  const summaryRef = useRef(summary);
  summaryRef.current = summary;
  const [connectionStatus, setConnectionStatus] =
    useState<TelemetryConnectionStatus>("connecting");
  const [frictionResponse, setFrictionResponse] =
    useState<FrictionScoreResponse | null>(null);
  const [adaptationPlan, setAdaptationPlan] =
    useState<AdaptiveUiPlan | null>(null);
  const [generationError, setGenerationError] =
    useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingAdaptationRequestRef = useRef<string | null>(null);
  const adaptationResponseTimerRef = useRef<number | undefined>(undefined);

  const sendAdaptationRequest = (
    friction: FrictionScoreResponse,
    consecutiveHighWindows: number,
  ): boolean => {
    const socket = socketRef.current;
    if (
      socket === null ||
      socket.readyState !== WebSocket.OPEN ||
      pendingAdaptationRequestRef.current !== null
    ) {
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
          },
        }),
      );
      adaptationResponseTimerRef.current = window.setTimeout(() => {
        if (pendingAdaptationRequestRef.current === requestId) {
          pendingAdaptationRequestRef.current = null;
          adaptationResponseTimerRef.current = undefined;
          setGenerationError("Live plan generation timed out.");
        }
      }, RESPONSE_TIMEOUT_MS);
      return true;
    } catch {
      pendingAdaptationRequestRef.current = null;
      setGenerationError("Unable to send the generation request.");
      return false;
    }
  };

  useEffect(() => {
    const socketUrl =
      import.meta.env.VITE_TELEMETRY_WS_URL || DEFAULT_TELEMETRY_WS_URL;
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let responseTimer: number | undefined;
    let pendingRequestId: string | null = null;
    let reconnectAttempt = 0;

    const clearPendingRequest = () => {
      pendingRequestId = null;
      if (responseTimer !== undefined) {
        window.clearTimeout(responseTimer);
        responseTimer = undefined;
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
              message.requestId !== pendingRequestId &&
              message.requestId !== pendingAdaptationRequestRef.current
            ) {
              console.debug("Ignoring stale telemetry response");
              return;
            }
            if (message.event === "friction.score") {
              if (message.requestId !== pendingRequestId) {
                return;
              }
              clearPendingRequest();
              setFrictionResponse(message.payload);
            } else if (message.event === "adaptation.plan") {
              if (message.requestId !== pendingAdaptationRequestRef.current) {
                return;
              }
              pendingAdaptationRequestRef.current = null;
              if (adaptationResponseTimerRef.current !== undefined) {
                window.clearTimeout(adaptationResponseTimerRef.current);
                adaptationResponseTimerRef.current = undefined;
              }
              setGenerationError(null);
              setAdaptationPlan(message.payload);
            } else if (message.event === "error") {
              if (message.requestId === pendingAdaptationRequestRef.current) {
                pendingAdaptationRequestRef.current = null;
                if (adaptationResponseTimerRef.current !== undefined) {
                  window.clearTimeout(adaptationResponseTimerRef.current);
                  adaptationResponseTimerRef.current = undefined;
                }
                setGenerationError(message.payload.message);
              }
              console.warn("Telemetry summary rejected", {
                code: message.payload.code,
                retryable: message.payload.retryable,
              });
            }
          } catch (error) {
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
        clearPendingRequest();
        pendingAdaptationRequestRef.current = null;
        if (adaptationResponseTimerRef.current !== undefined) {
          window.clearTimeout(adaptationResponseTimerRef.current);
          adaptationResponseTimerRef.current = undefined;
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
      if (pendingRequestId !== null) {
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
        pendingRequestId = requestId;
        responseTimer = window.setTimeout(() => {
          if (pendingRequestId === requestId) {
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
      if (summaryTimer !== undefined) {
        window.clearInterval(summaryTimer);
      }
      clearPendingRequest();
      socketRef.current = null;
      pendingAdaptationRequestRef.current = null;
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
    sendAdaptationRequest,
  };
}
