import { createNeonAuth } from "@neon/auth/next/server";

/**
 * Neon Auth (managed Better Auth) — server side.
 *
 * Neon hosts the Better Auth server on the project's branch (enabled via
 * `neon deploy` with `auth: true` in neon.ts); users, sessions and auth
 * config live in the branch's `neon_auth` schema. This module is the only
 * place the web process constructs the server client.
 *
 * Environment (root `.env`, written by `neon deploy` / `neon env pull`):
 * - NEON_AUTH_BASE_URL      managed auth issuer URL (public, includes path)
 * - NEON_AUTH_COOKIE_SECRET app-side secret for the SDK's cached session
 *                           cookies — generated locally, NOT injected by Neon
 *
 * Lazy singleton on purpose: `next build` imports route modules without a
 * runtime environment, so construction is deferred to the first request —
 * a missing variable then fails that one request loudly (repo culture:
 * config errors are loud, never silent) instead of breaking the build.
 */
let instance: ReturnType<typeof createNeonAuth> | null = null;

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `Neon Auth is not configured: ${name} is missing (provision with \`neon deploy\`, then \`neon env pull\`)`,
    );
  }
  return value;
}

export function neonAuth(): ReturnType<typeof createNeonAuth> {
  if (instance === null) {
    instance = createNeonAuth({
      baseUrl: required("NEON_AUTH_BASE_URL"),
      cookies: { secret: required("NEON_AUTH_COOKIE_SECRET") },
    });
  }
  return instance;
}
