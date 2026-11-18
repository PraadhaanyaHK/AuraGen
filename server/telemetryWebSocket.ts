import { WebSocket, WebSocketServer, type RawData } from "ws";
import {
  CONTRACT_VERSION,
  MAX_WEBSOCKET_MESSAGE_BYTES,
  MessageInputError,
  parseClientMessage,
  type ClientMessage,
  type MessageInput,
  type ServerMessage,
} from "../src/contracts.js";
import {
  createAdaptationTriggerState,
  evaluateAdaptationTrigger,
  scoreInteractionFriction,
} from "../src/friction.js";

const REQUEST_ID_CACHE_SIZE = 256;
const MAX_TELEMETRY_AGE_MS = 60_000;
const MAX_FUTURE_CLOCK_SKEW_MS = 30_000;

type TelemetryServerOptions = {
  host?: string;
  port: number;
  now?: () => number;
};

function toMessageInput(data: RawData): MessageInput {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  return data;
}

function sendError(
  socket: WebSocket,
  requestId: string,
  code:
    | "INVALID_MESSAGE"
    | "INVALID_TELEMETRY"
    | "INVALID_ADAPTATION_REQUEST"
    | "MESSAGE_TOO_LARGE",
  message: string,
  retryable = false,
): void {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }
  const response: ServerMessage = {
    protocolVersion: CONTRACT_VERSION,
    requestId,
    event: "error",
    payload: { code, message, retryable },
  };
  socket.send(JSON.stringify(response));
}

export function createTelemetryWebSocketServer({
  host = "127.0.0.1",
  port,
  now = Date.now,
}: TelemetryServerOptions): WebSocketServer {
  const server = new WebSocketServer({
    host,
    port,
    path: "/telemetry",
    maxPayload: MAX_WEBSOCKET_MESSAGE_BYTES,
  });

  server.on("connection", (socket) => {
    let triggerState = createAdaptationTriggerState();
    const seenRequestIds = new Set<string>();
    console.info("Telemetry WebSocket session connected");

    socket.on("message", (data) => {
      let message: ClientMessage;
      try {
        message = parseClientMessage(toMessageInput(data));
      } catch (error) {
        if (!(error instanceof MessageInputError)) {
          throw error;
        }
        console.warn("Telemetry message rejected", { code: error.code });
        sendError(
          socket,
          "00000000-0000-4000-8000-000000000000",
          error.code,
          error.message,
        );
        return;
      }

      if (message.event !== "telemetry.summary") {
        console.warn("Unsupported telemetry event rejected");
        sendError(
          socket,
          message.requestId,
          "INVALID_ADAPTATION_REQUEST",
          "Adaptation requests are not enabled on this service",
        );
        return;
      }

      if (seenRequestIds.has(message.requestId)) {
        console.warn("Duplicate telemetry request rejected");
        sendError(
          socket,
          message.requestId,
          "INVALID_MESSAGE",
          "requestId has already been used on this connection",
        );
        return;
      }
      seenRequestIds.add(message.requestId);
      if (seenRequestIds.size > REQUEST_ID_CACHE_SIZE) {
        const oldestRequestId = seenRequestIds.values().next().value;
        if (oldestRequestId !== undefined) {
          seenRequestIds.delete(oldestRequestId);
        }
      }

      const nowMs = now();
      const windowEnd = Date.parse(message.payload.windowEnd);
      if (
        windowEnd > nowMs + MAX_FUTURE_CLOCK_SKEW_MS ||
        nowMs - windowEnd > MAX_TELEMETRY_AGE_MS
      ) {
        console.warn("Stale telemetry summary rejected");
        sendError(
          socket,
          message.requestId,
          "INVALID_TELEMETRY",
          "Telemetry summary is outside the accepted time window",
        );
        return;
      }

      const score = scoreInteractionFriction(message.payload);
      const evaluation = evaluateAdaptationTrigger(
        message.payload,
        score,
        triggerState,
        nowMs,
      );
      triggerState = evaluation.state;
      const response: ServerMessage = {
        protocolVersion: "1.1",
        requestId: message.requestId,
        event: "friction.score",
        payload: evaluation.scoreResponse,
      };
      socket.send(JSON.stringify(response));
      console.info("Telemetry summary scored", {
        level: evaluation.scoreResponse.level,
        adaptationEligible: evaluation.scoreResponse.eligibleForAdaptation,
      });
    });

    socket.on("close", () => {
      console.info("Telemetry WebSocket session disconnected");
    });
    socket.on("error", () => {
      console.warn("Telemetry WebSocket transport error");
    });
  });

  return server;
}
