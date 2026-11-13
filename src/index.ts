import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { openDb } from "./db.ts";

const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.SOCIAL_CUBE_DB ?? "data/social-cube.sqlite";
const seed = process.env.SOCIAL_CUBE_SEED !== "0";

const app = createApp({ db: openDb(dbPath), seed });

serve({ fetch: app.fetch, port }, (info) => {
  console.log(
    `social-cube listening on http://127.0.0.1:${info.port} (db=${dbPath})`,
  );
});
