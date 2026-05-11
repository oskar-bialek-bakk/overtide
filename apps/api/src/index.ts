import { createApp } from "./app";

const port = Number(process.env.PORT ?? 8787);
const app = createApp();

Bun.serve({ hostname: "127.0.0.1", port, fetch: app.fetch });
console.log(`Overtide API listening on http://127.0.0.1:${port}`);
