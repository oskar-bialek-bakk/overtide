export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
    public httpStatus?: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export type ApiFetchOptions = {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

type Envelope<T> = {
  data?: T;
  error?: { code: string; message: string; details?: unknown };
};

export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  if (opts.signal) init.signal = opts.signal;
  const res = await fetch(path, init);

  const json = (await res.json().catch(() => null)) as Envelope<T> | null;

  if (!json) {
    throw new ApiClientError(
      "BAD_RESPONSE",
      `non-JSON response (${res.status})`,
      undefined,
      res.status,
    );
  }
  if (json.error) {
    throw new ApiClientError(json.error.code, json.error.message, json.error.details, res.status);
  }
  if (json.data !== undefined) return json.data;
  throw new ApiClientError("BAD_RESPONSE", "neither data nor error", undefined, res.status);
}
