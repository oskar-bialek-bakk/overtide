import { createApp } from "./app";

const { app, env } = createApp(process.env.DB_PATH ? { dbPath: process.env.DB_PATH } : undefined);

Bun.serve({
  hostname: "127.0.0.1",
  port: env.port,
  fetch: app.fetch,
  idleTimeout: 255, // max Bun allows; first sync over ~11k time entries can exceed default 10s
});
console.log(`Overtide API listening on http://127.0.0.1:${env.port}`);
