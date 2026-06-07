import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, apiFetch } from "./client";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("apiFetch", () => {
  it("unwraps the data envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { x: 1 } }), { status: 200 })),
    );
    expect(await apiFetch("/api/x")).toEqual({ x: 1 });
  });

  it("throws ApiClientError when the envelope contains an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: { code: "BOOM", message: "no" } }), { status: 400 }),
        ),
    );
    await expect(apiFetch("/api/x")).rejects.toMatchObject({
      code: "BOOM",
      message: "no",
      httpStatus: 400,
    });
  });

  it("sends a JSON body and Content-Type on POST", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await apiFetch("/api/x", { method: "POST", body: { a: 1 } });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/x",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ a: 1 }),
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
  });

  it("throws BAD_RESPONSE when the body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 502 })));
    await expect(apiFetch("/api/x")).rejects.toMatchObject({
      code: "BAD_RESPONSE",
      httpStatus: 502,
    });
  });

  it("throws BAD_RESPONSE when neither data nor error is present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
    );
    await expect(apiFetch("/api/x")).rejects.toMatchObject({
      code: "BAD_RESPONSE",
    });
  });
});
