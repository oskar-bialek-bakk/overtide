import type { ErrorHandler } from "hono";
import { ZodError } from "zod";
import { logger } from "../lib/logger";
import { AppError, fail } from "../lib/envelope";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) return fail(c, err);
  if (err instanceof ZodError) {
    return fail(c, new AppError("VALIDATION_ERROR", 400, "Invalid input", err.flatten()));
  }
  const code =
    "code" in err && typeof (err as { code: unknown }).code === "string"
      ? (err as { code: string }).code
      : "INTERNAL_ERROR";
  logger.error({ err }, "unhandled error");
  return fail(c, new AppError(code, 500, err.message ?? "Internal error"));
};
