import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import express, {
  type ErrorRequestHandler,
  type Express,
} from "express";
import {
  CONTRACT_VERSION,
  MAX_WEBSOCKET_MESSAGE_BYTES,
  MessageInputError,
  parseClientMessage,
  ServerMessageSchema,
  type ClientMessage,
  type StandardErrorResponse,
} from "../src/contracts.js";
import {
  generateUiPlan,
  GenerationProviderError,
  InvalidGeneratedPlanError,
  InvalidGenerationRequestError,
  mockPlanProvider,
  type UiPlanGenerationProvider,
} from "./generation.js";
import {
  WebSocket,
  WebSocketServer,
  type RawData,
} from "ws";

export type ClientMessageHandler = (
  message: ClientMessage,
  socket: WebSocket,
) => void | Promise<void>;

export interface ApiServer {
  app: Express;
  httpServer: Server;
  webSocketServer: WebSocketServer;
}

export interface ApiServerOptions {
  provider?: UiPlanGenerationProvider;
  onClientMessage?: ClientMessageHandler;
}

function isBodyParserError(
  error: unknown,
): error is Error & { type: string; status: number } {
  return (
    error instanceof Error &&
    "type" in error &&
    typeof error.type === "string" &&
    "status" in error &&
    typeof error.status === "number"
  );
}

function sendSocketError(
  socket: WebSocket,
  code: StandardErrorResponse["code"],
  message: string,
  retryable: boolean,
): void {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  const response = ServerMessageSchema.parse({
    protocolVersion: CONTRACT_VERSION,
    requestId: randomUUID(),
    event: "error",
    payload: { code, message, retryable },
  });
  socket.send(JSON.stringify(response));
}

function toBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

export function createApiServer(options: ApiServerOptions = {}): ApiServer {
  const app = express();
  const provider = options.provider ?? mockPlanProvider;
  const onClientMessage = options.onClientMessage ?? (() => undefined);

  app.disable("x-powered-by");
  app.use(express.json({ limit: MAX_WEBSOCKET_MESSAGE_BYTES }));

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.post("/api/generate", async (request, response) => {
    try {
      const plan = await generateUiPlan(request.body, provider);
      response.status(200).json(plan);
    } catch (error) {
      if (error instanceof InvalidGenerationRequestError) {
        response.status(400).json({
          error: {
            code: "INVALID_MESSAGE",
            message:
              "Generation request must contain only approved metadata and aggregate friction reasons.",
            retryable: false,
          },
        });
        return;
      }

      if (
        error instanceof GenerationProviderError ||
        error instanceof InvalidGeneratedPlanError
      ) {
        response.status(502).json({
          error: {
            code: "GENERATION_FAILED",
            message: "A valid UI plan could not be generated.",
            retryable: true,
          },
        });
        return;
      }

      response.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "The request could not be processed.",
          retryable: false,
        },
      });
    }
  });

  const bodyParserErrorHandler: ErrorRequestHandler = (
    error,
    _request,
    response,
    next,
  ) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    if (isBodyParserError(error) && error.type === "entity.too.large") {
      response.status(413).json({
        error: {
          code: "MESSAGE_TOO_LARGE",
          message: "Request body exceeds the allowed size.",
          retryable: false,
        },
      });
      return;
    }

    if (
      (isBodyParserError(error) && error.type === "entity.parse.failed") ||
      error instanceof SyntaxError
    ) {
      response.status(400).json({
        error: {
          code: "INVALID_MESSAGE",
          message: "Request body must contain valid JSON.",
          retryable: false,
        },
      });
      return;
    }

    response.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "The request could not be processed.",
        retryable: false,
      },
    });
  };
  app.use(bodyParserErrorHandler);

  const httpServer = createServer(app);
  const webSocketServer = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    maxPayload: MAX_WEBSOCKET_MESSAGE_BYTES,
    perMessageDeflate: false,
  });

  webSocketServer.on("connection", (socket) => {
    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        sendSocketError(
          socket,
          "INVALID_MESSAGE",
          "WebSocket messages must contain a text JSON envelope.",
          false,
        );
        return;
      }

      let message: ClientMessage;
      try {
        message = parseClientMessage(toBuffer(data));
      } catch (error) {
        const code =
          error instanceof MessageInputError
            ? error.code
            : "INVALID_MESSAGE";
        sendSocketError(
          socket,
          code,
          "WebSocket message is invalid.",
          false,
        );
        return;
      }

      void Promise.resolve()
        .then(() => onClientMessage(message, socket))
        .catch(() => {
          sendSocketError(
            socket,
            "INTERNAL_ERROR",
            "The message could not be processed.",
            true,
          );
        });
    });

    socket.on("error", (error) => {
      console.error("WebSocket transport error:", error.message);
    });
  });

  return { app, httpServer, webSocketServer };
}
