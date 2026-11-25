import { once } from "node:events";
import {
  createTelemetryWebSocketServer,
  type TelemetryServerOptions,
} from "./telemetryWebSocket.js";

export async function startTelemetryWebSocketServer(
  options: TelemetryServerOptions,
) {
  const server = createTelemetryWebSocketServer(options);
  await once(server, "listening");
  return server;
}
