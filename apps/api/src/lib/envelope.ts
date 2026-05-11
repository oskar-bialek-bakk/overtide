import type { Context } from "hono";

export class AppError extends Error {
  constructor(
    public code: string,
    public httpStatus: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const ok = <T>(c: Context, data: T, meta?: Record<string, unknown>) =>
  c.json({ data, ...(meta ? { meta } : {}) });

export const fail = (c: Context, e: AppError) =>
  c.json({ error: { code: e.code, message: e.message, details: e.details } }, e.httpStatus as 400);
