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

/** Next 15+/16 route-handler context: params arrive as a Promise. */
type RouteContext = { params: Promise<{ path: string[] }> };

type SdkHandler = (
  request: Request,
  context: RouteContext,
) => Promise<Response>;

function dispatch(verb: Verb): (request: Request, context: RouteContext) => Promise<Response> {
  return async (request, context) => {
    // The managed SDK's handler destructures `{ params }` from its SECOND
    // argument (it awaits `params.path` to build the proxied auth path), so
    // the Next context must be forwarded as-is — dropping it is a guaranteed
    // 500 ("Cannot destructure property 'params' of 'undefined'").
    const handler = neonAuth().handler()[verb] as SdkHandler;
    return handler(request, context);
  };
}

export const GET = dispatch("GET");
export const POST = dispatch("POST");
export const PUT = dispatch("PUT");
export const DELETE = dispatch("DELETE");
export const PATCH = dispatch("PATCH");
