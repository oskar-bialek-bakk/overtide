import type { Env } from "../config/env";

export function buildAuthHeaders(env: Env): Record<string, string> {
  if (env.auth.kind === "apiKey") return { "X-Redmine-API-Key": env.auth.apiKey };
  const token = Buffer.from(`${env.auth.username}:${env.auth.password}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}
