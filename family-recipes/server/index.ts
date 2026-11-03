import { readFileSync } from "node:fs";
import path from "node:path";
import { createApp } from "./app.js";

const dataDir = "/data";
const options = JSON.parse(readFileSync(path.join(dataDir, "options.json"), "utf8")) as { initial_admin_id?: unknown };
if (typeof options.initial_admin_id !== "string" || !options.initial_admin_id.trim()) {
  throw new Error("Set initial_admin_id to the Home Assistant user ID of the initial administrator");
}
const { app, close } = createApp({ dataDir, initialAdminId: options.initial_admin_id, staticDir: path.resolve("dist") });
const server = app.listen(8099, "0.0.0.0", () => console.log("Family Recipes listening on port 8099 for Home Assistant ingress"));
const shutdown = () => server.close(() => { close(); process.exit(0); });
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
