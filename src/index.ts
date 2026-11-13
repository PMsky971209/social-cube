import { existsSync, readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { openDb } from "./db.ts";

/** Load .env into process.env without overriding existing vars. */
function loadDotEnv(path = ".env"): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.SOCIAL_CUBE_DB ?? "data/social-cube.sqlite";
const seed = process.env.SOCIAL_CUBE_SEED !== "0";

const app = createApp({ db: openDb(dbPath), seed });

serve({ fetch: app.fetch, port }, (info) => {
  console.log(
    `social-cube listening on http://127.0.0.1:${info.port} (db=${dbPath})`,
  );
});
