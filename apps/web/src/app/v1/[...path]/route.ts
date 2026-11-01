import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Node-runtime proxy for `/v1/*` (branch `vercel/alpha`).
 *
 * Why not the next.config rewrite: on Vercel, edge rewrites whose destination
 * is another `*.vercel.app` project are blocked by the platform's SSRF
 * loop-guard (DNS_HOSTNAME_RESOLVED_PRIVATE). This route handler reproduces
 * the SAME hop chain as the Render topology (ADR-0003):
 *
 *   browser → web (this handler, Node runtime) → API_INTERNAL_URL (NestJS API)
 *
 * The web process stays secret-free (packages/config guard): it forwards
 * method, headers, cookies, and body to the API and streams the response
 * back — it never sees database URLs or auth secrets.
 *
 * Cookies: better-auth sets MULTIPLE Set-Cookie headers (session token +
 * CSRF); they are replayed individually so none collapse.
 */
const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "content-length",
  "accept-encoding",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
]);

const RESPONSE_DROP = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
]);

async function proxy(request: NextRequest): Promise<Response> {
  const base = process.env.API_INTERNAL_URL;
  if (!base) {
    return Response.json(
      {
        type: "about:blank",
        title: "misconfigured_web_proxy",
        status: 500,
        detail: "API_INTERNAL_URL is not set on the web deployment",
      },
      { status: 500 },
    );
  }
  const incoming = new URL(request.url);
  const target = `${base.replace(/\/$/, "")}${incoming.pathname}${incoming.search}`;

  const headers = new Headers();
  for (const [key, value] of request.headers) {
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    headers.set(key, value);
  }

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    });
  } catch {
    return Response.json(
      {
        type: "about:blank",
        title: "api_unreachable",
        status: 502,
        detail: "the internal API did not answer",
      },
      { status: 502 },
    );
  }

  const out = new Headers();
  for (const [key, value] of upstream.headers) {
    if (RESPONSE_DROP.has(key.toLowerCase()) || key.toLowerCase() === "set-cookie") continue;
    out.set(key, value);
  }
  for (const cookie of upstream.headers.getSetCookie()) {
    out.append("set-cookie", cookie);
  }

  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
  proxy as HEAD,
  proxy as OPTIONS,
};
