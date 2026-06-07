import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { type ApiResponse, apiResponseSchema } from "./envelope";

describe("apiResponseSchema", () => {
  const wrap = apiResponseSchema(z.object({ value: z.number() }));

  it("parses success payload", () => {
    const parsed = wrap.parse({ data: { value: 42 } });
    expect(parsed).toEqual({ data: { value: 42 } });
  });

  it("parses error payload", () => {
    const parsed = wrap.parse({ error: { code: "X", message: "y" } });
    expect("error" in parsed).toBe(true);
  });

  it("rejects payload with both data and error", () => {
    expect(() => wrap.parse({ data: { value: 1 }, error: { code: "X", message: "y" } })).toThrow();
  });
});
