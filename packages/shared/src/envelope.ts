import { z } from "zod";

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const apiMetaSchema = z
  .object({
    total: z.number().optional(),
    lastSync: z.string().optional(),
  })
  .optional();
export type ApiMeta = z.infer<typeof apiMetaSchema>;

export const apiResponseSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.union([
    z.object({ data, meta: apiMetaSchema }).strict(),
    z.object({ error: apiErrorSchema }).strict(),
  ]);

export type ApiResponse<T> = { data: T; meta?: ApiMeta } | { error: ApiError };
