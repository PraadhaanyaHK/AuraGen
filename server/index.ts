import { createApiServer } from "./api.js";

const port = Number(process.env.PORT ?? "3001");
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const { httpServer } = createApiServer();
httpServer.on("error", (error) => {
  console.error("API server failed to start:", error.message);
  process.exitCode = 1;
});
httpServer.listen(port, "127.0.0.1", () => {
  console.info(`AuraGen API listening on http://127.0.0.1:${port}`);
});
