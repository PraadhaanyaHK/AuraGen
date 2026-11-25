import { WebSocket, WebSocketServer, type RawData } from "ws";
import {
  CONTRACT_VERSION,
  MAX_WEBSOCKET_MESSAGE_BYTES,
  MessageInputError,
  parseClientMessage,
  type ClientMessage,
  type FrictionScoreResponse,
  type MessageInput,
  type ServerMessage,
} from "../src/contracts.js";
import {
  createAdaptationTriggerState,
  evaluateAdaptationTrigger,
  scoreInteractionFriction,
} from "../src/friction.js";
import { generateAdaptiveUiPlan } from "./generation.js";

const REQUEST_ID_CACHE_SIZE = 256;
const MAX_TELEMETRY_AGE_MS = 60_000;
const MAX_FUTURE_CLOCK_SKEW_MS = 30_000;
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

export type TelemetryServerOptions = {
  host?: string;
  port: number;
  now?: () => number;
  allowedOrigins?: readonly string[];
  generatePlan?: typeof generateAdaptiveUiPlan;
};

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1";
}

function createAllowedOriginSet(origins: readonly string[]): Set<string> {
  const allowedOrigins = new Set<string>();
  for (const origin of origins) {
    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new RangeError("Allowed WebSocket origins must be valid URLs");
    }
    if (
      (parsedOrigin.protocol !== "http:" &&
        parsedOrigin.protocol !== "https:") ||
      parsedOrigin.origin !== origin
    ) {
      throw new RangeError(
        "Allowed WebSocket origins must be exact HTTP or HTTPS origins",
      );
    }
    allowedOrigins.add(origin);
  }
  if (allowedOrigins.size === 0) {
    throw new RangeError("At least one WebSocket origin must be allowed");
  }
  return allowedOrigins;
}

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
    | "GENERATION_FAILED"
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
  allowedOrigins = DEFAULT_ALLOWED_ORIGINS,
  generatePlan = generateAdaptiveUiPlan,
}: TelemetryServerOptions): WebSocketServer {
  if (!isLoopbackHost(host)) {
    throw new RangeError(
      "The telemetry WebSocket service may only bind to a loopback host",
    );
  }
  const allowedOriginSet = createAllowedOriginSet(allowedOrigins);
  const server = new WebSocketServer({
    host,
    port,
    path: "/telemetry",
    maxPayload: MAX_WEBSOCKET_MESSAGE_BYTES,
    verifyClient: (info, callback) => {
      const allowed =
        typeof info.origin === "string" && allowedOriginSet.has(info.origin);
      callback(
        allowed,
        allowed ? undefined : 403,
        allowed ? undefined : "Origin not allowed",
      );
    },
  });

  server.on("connection", (socket) => {
    let triggerState = createAdaptationTriggerState();
    let eligibleFrictionResponse: FrictionScoreResponse | null = null;
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
          error.requestId ?? "00000000-0000-4000-8000-000000000000",
          error.code,
          error.message,
        );
        return;
      }

      if (seenRequestIds.has(message.requestId)) {
        console.warn("Duplicate request rejected", { event: message.event });
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

      if (message.event !== "telemetry.summary") {
        const friction = eligibleFrictionResponse;
        eligibleFrictionResponse = null;
        if (friction === null) {
          sendError(
            socket,
            message.requestId,
            "INVALID_ADAPTATION_REQUEST",
            "Adaptation requires an eligible server-scored telemetry window.",
          );
          return;
        }
        const frictionReasons = [
          ...friction.observedSignals,
          ...friction.explanations
            .filter((feature) => feature.count > 0)
            .map((feature) => `${feature.feature}:${feature.count}`),
        ].slice(0, 6);
        const relevantExplanations = friction.explanations
          .filter((feature) => feature.included && feature.count > 0)
          .map((feature) => feature.explanation)
          .slice(0, 6);
        void generatePlan({
          frictionReasons,
          frictionScore: {
            score: friction.score,
            level: friction.level,
            observedSignals: friction.observedSignals,
            relevantExplanations,
          },
          presentationMode: message.payload.presentationMode,
          previousPlan: message.payload.previousPlan,
        })
          .then((result) => {
            if (socket.readyState !== WebSocket.OPEN) {
              return;
            }
            if (result.error !== undefined) {
              console.warn("Adaptive generation failed", {
                code: result.error.code,
                retryable: result.error.retryable,
              });
              sendError(
                socket,
                message.requestId,
                "GENERATION_FAILED",
                result.error.message,
                result.error.retryable,
              );
              return;
            }
            const response: ServerMessage = {
              protocolVersion: CONTRACT_VERSION,
              requestId: message.requestId,
              event: "adaptation.plan",
              payload: result.plan,
            };
            socket.send(JSON.stringify(response));
          })
          .catch(() => {
            console.warn("Adaptive generation failed", {
              code: "GENERATION_FAILED",
            });
            sendError(
              socket,
              message.requestId,
              "GENERATION_FAILED",
              "Generation failed; the approved original layout remains available.",
              false,
            );
          });
        return;
      }

      eligibleFrictionResponse = null;
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
      if (evaluation.scoreResponse.eligibleForAdaptation) {
        eligibleFrictionResponse = evaluation.scoreResponse;
      }
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
