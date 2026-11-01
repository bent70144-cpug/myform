import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Vercel serverless adapter (branch `vercel/alpha`).
 *
 * Vercel has no long-running process for the NestJS API, so this adapter
 * exposes the SAME app factory (`createApiApp`) that `main.ts` boots —
 * behind the platform's request/response cycle instead of a listen() call:
 *
 *   browser → Next.js `/v1/*` rewrite (apps/web, API_INTERNAL_URL)
 *           → this function (myform-api.vercel.app)
 *           → createApiApp() → express instance → controllers
 *
 * Design notes:
 * - The app is created ONCE per warm lambda and cached in a module-level
 *   promise; cold starts pay full init (env parse → pool → Better Auth DDL
 *   check → Nest DI), warm invocations reuse it (Vercel fluid compute keeps
 *   instances warm). The tenant pool is released by the platform on scale-down.
 * - esbuild (via tsx's own toolchain contract) cannot emit decorator type
 *   metadata, so Nest DI must be explicit — every controller/service that
   *   needs injection already declares @Inject(...) (landed in ticket 12 for
 *   the tsx runtime; verified by the production `start: tsx` script).
 * - Missing/invalid env still fails FAST: createApiApp() parses env first,
 *   and this adapter turns a boot failure into an RFC 9457 problem+json 500
 *   instead of a platform error page.
 * - Trusted proxy: on Vercel the TCP peer is the edge proxy, so client IPs
 *   (rate limiting, audit) derive from X-Forwarded-For — set
 *   TRUSTED_PROXY_COUNT=1 on the project.
 */

type ExpressHandler = (req: IncomingMessage, res: ServerResponse) => unknown;

let handlerPromise: Promise<ExpressHandler> | undefined;

function loadExpressHandler(): Promise<ExpressHandler> {
  return import("../src/app").then(({ createApiApp }) =>
    createApiApp().then(
      ({ nestApp }) =>
        nestApp.getHttpAdapter().getInstance() as unknown as ExpressHandler,
    ),
  );
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    handlerPromise ??= loadExpressHandler();
    const app = await handlerPromise;
    app(req, res);
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        event: "vercel.boot_failure",
        error: error instanceof Error ? error.message : String(error),
      }) + "\n",
    );
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/problem+json");
    }
    if (!res.writableEnded) {
      res.end(
        JSON.stringify({
          type: "about:blank",
          title: "internal_error",
          status: 500,
          detail: "the API failed to boot in this environment",
        }),
      );
    }
  }
}
