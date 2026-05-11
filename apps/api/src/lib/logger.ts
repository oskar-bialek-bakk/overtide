import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "password", "*.password", "*.*.password",
      "apiKey", "*.apiKey",
      "authorization", "*.authorization",
      "REDMINE_PASSWORD", "REDMINE_API_KEY",
    ],
    censor: "[REDACTED]",
  },
  ...(isDev ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}),
});
