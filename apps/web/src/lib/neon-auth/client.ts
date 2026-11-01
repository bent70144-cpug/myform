"use client";

import { createAuthClient } from "@neon/auth/next";

/**
 * Browser client for Neon Auth (managed Better Auth).
 *
 * Takes NO arguments by contract (Neon managed-auth quickstart): it always
 * talks to the SAME-ORIGIN `/api/auth/*` proxy route
 * (src/app/api/auth/[...path]/route.ts), which forwards to the managed
 * server using NEON_AUTH_BASE_URL server-side. The browser never sees the
 * managed auth URL or any secret, mirroring the /v1 proxy hop chain.
 *
 * Methods used: signUp.email({ email, password, name }), getSession().
 * Result shape is `{ data, error }`; the user is `data.user`.
 *
 * The explicit ReturnType annotation is required: the SDK's inferred client
 * type references transitive internals (@better-fetch/fetch, better-auth/react)
 * that pnpm's strict layout cannot name from this package (TS2742/TS7056).
 */
export const neonAuthClient: ReturnType<typeof createAuthClient> = createAuthClient();
