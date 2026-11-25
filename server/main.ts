import { startTelemetryWebSocketServer } from "./startTelemetryWebSocket.js";

const port = Number(process.env.TELEMETRY_WS_PORT ?? 8081);
if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new RangeError("TELEMETRY_WS_PORT must be a valid TCP port");
}

const server = await startTelemetryWebSocketServer({
  host: process.env.TELEMETRY_WS_HOST ?? "127.0.0.1",
  port,
  allowedOrigins: process.env.TELEMETRY_WS_ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
});
const address = server.address();
if (address === null || typeof address === "string") {
  throw new Error("Telemetry WebSocket service did not bind to a TCP port");
}
console.info("Telemetry WebSocket service listening", { port: address.port });

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const client of server.clients) {
    client.close(1001, "Service shutting down");
  }
  server.close();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
