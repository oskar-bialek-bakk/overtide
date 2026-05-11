import { setupServer } from "msw/node";
import type { RequestHandler } from "msw";
export function startMsw(...handlers: RequestHandler[]) {
  const server = setupServer(...handlers);
  server.listen({ onUnhandledRequest: "error" });
  return server;
}
