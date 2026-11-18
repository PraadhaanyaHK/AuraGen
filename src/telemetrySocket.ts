import { useEffect, useRef, useState } from "react";
import {
  CONTRACT_VERSION,
  MessageInputError,
  parseServerMessage,
  type FrictionScoreResponse,
  type TelemetrySummary,
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
} {
  const summaryRef = useRef(summary);
  summaryRef.current = summary;
  const [connectionStatus, setConnectionStatus] =
    useState<TelemetryConnectionStatus>("connecting");
  const [frictionResponse, setFrictionResponse] =
    useState<FrictionScoreResponse | null>(null);

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
            if (message.requestId !== pendingRequestId) {
              console.debug("Ignoring stale telemetry response");
              return;
            }
            clearPendingRequest();
            if (message.event === "friction.score") {
              setFrictionResponse(message.payload);
            } else if (message.event === "error") {
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
        clearPendingRequest();
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
      socket?.close();
      socket = null;
    };
  }, []);

  return { connectionStatus, frictionResponse };
}
