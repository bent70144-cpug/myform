import { neonAuth } from "../../../../lib/neon-auth/server";

export const dynamic = "force-dynamic";

/**
 * Same-origin proxy for Neon Auth (managed Better Auth):
 *
 *   browser → /api/auth/* (this handler, Node runtime) → NEON_AUTH_BASE_URL
 *
 * Mirrors the /v1 proxy pattern (src/app/v1/[...path]/route.ts): the browser
 * talks only to this app's origin, and the managed auth URL plus cookie
 * secret stay server-side. Neon hosts the auth server — no betterAuth()
 * instance, no database adapter, no auth migrations run here.
 *
 * The managed SDK's handler() exposes the five verbs Better Auth uses; each
 * is wired lazily so `next build` can import this module without env vars.
 */
type Verb = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

function dispatch(verb: Verb): (request: Request) => Promise<Response> {
  return async (request) => {
    const handler = neonAuth().handler() as Record<
      Verb,
      (r: Request) => Promise<Response>
    >;
    return handler[verb](request);
  };
}

export const GET = dispatch("GET");
export const POST = dispatch("POST");
export const PUT = dispatch("PUT");
export const DELETE = dispatch("DELETE");
export const PATCH = dispatch("PATCH");
