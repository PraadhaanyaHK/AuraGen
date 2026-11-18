import { once } from "node:events";
import { createTelemetryWebSocketServer } from "./telemetryWebSocket.js";

export async function startTelemetryWebSocketServer(options: {
  host?: string;
  port: number;
  now?: () => number;
}) {
  const server = createTelemetryWebSocketServer(options);
  await once(server, "listening");
  return server;
}
