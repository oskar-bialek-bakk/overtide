import { z } from "zod";

const rawSchema = z.object({
  REDMINE_URL: z.string().url(),
  REDMINE_USERNAME: z.string().min(1).optional(),
  REDMINE_PASSWORD: z.string().min(1).optional(),
  REDMINE_API_KEY: z.string().min(1).optional(),
  REDMINE_TRACKER_REDEMPTION_ID: z.coerce.number().int().positive(),
  REDMINE_ACTIVITY_OVERTIME_ID: z.coerce.number().int().positive(),
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Env = {
  redmineUrl: string;
  auth: { kind: "apiKey"; apiKey: string } | { kind: "basic"; username: string; password: string };
  redemptionTrackerId: number;
  overtimeActivityId: number;
  port: number;
  logLevel: string;
};

export function loadEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): Env {
  const parsed = rawSchema.parse(source);

  let auth: Env["auth"];
  if (parsed.REDMINE_API_KEY) {
    auth = { kind: "apiKey", apiKey: parsed.REDMINE_API_KEY };
  } else if (parsed.REDMINE_USERNAME && parsed.REDMINE_PASSWORD) {
    auth = { kind: "basic", username: parsed.REDMINE_USERNAME, password: parsed.REDMINE_PASSWORD };
  } else {
    throw new Error("AUTH_NOT_CONFIGURED: set REDMINE_API_KEY or REDMINE_USERNAME+REDMINE_PASSWORD");
  }

  return {
    redmineUrl: parsed.REDMINE_URL.replace(/\/$/, ""),
    auth,
    redemptionTrackerId: parsed.REDMINE_TRACKER_REDEMPTION_ID,
    overtimeActivityId: parsed.REDMINE_ACTIVITY_OVERTIME_ID,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
  };
}
