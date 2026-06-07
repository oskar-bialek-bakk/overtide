import type { ErrorHandler } from "hono";
import { ZodError } from "zod";
import { AppError, fail } from "../lib/envelope";
import { logger } from "../lib/logger";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) return fail(c, err);
  if (err instanceof ZodError) {
    return fail(c, new AppError("VALIDATION_ERROR", 400, "Invalid input", err.flatten()));
  }
  const isObj = err !== null && typeof err === "object";
  const code =
    isObj && "code" in err && typeof (err as { code: unknown }).code === "string"
      ? (err as { code: string }).code
      : "INTERNAL_ERROR";
  const message =
    err instanceof Error
      ? err.message
      : isObj && "message" in err && typeof (err as { message: unknown }).message === "string"
        ? (err as { message: string }).message
        : String(err);
  logger.error({ err }, "unhandled error");
  return fail(c, new AppError(code, 500, message || "Internal error"));
};
