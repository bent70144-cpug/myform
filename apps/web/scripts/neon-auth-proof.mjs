#!/usr/bin/env node
/**
 * Neon Auth end-to-end proof (managed Better Auth on branch main).
 *
 * Proves the real user journey against the LIVE managed auth server:
 *   1. sign up a real user (email + password) via the @neon/auth SDK client
 *   2. read the CURRENT USER back through the SDK session call
 *   3. sign in from a fresh client with the same credentials (login round-trip)
 *
 * Usage:  node scripts/neon-auth-proof.mjs      (cwd = apps/web)
 * Env:    NEON_AUTH_BASE_URL (repo root .env, written by `neon deploy`)
 *
 * Output discipline: user identifiers only. The generated password, any
 * session tokens and cookies are NEVER printed.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createAuthClient } from "@neon/auth";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(webRoot, "..", "..");

// Minimal .env reader: repo root .env (the `neon deploy` target) first, then
// apps/web/.env.local. Existing process env always wins. Values never logged.
for (const file of [join(repoRoot, ".env"), join(webRoot, ".env.local")]) {
  let lines;
  try {
    lines = readFileSync(file, "utf8").split("\n");
  } catch {
    continue; // optional file
  }
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (m[1] in process.env) continue;
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[m[1]] = value;
  }
}

const baseUrl = process.env.NEON_AUTH_BASE_URL;
if (!baseUrl) {
  console.error("FAIL: NEON_AUTH_BASE_URL missing — run `neon deploy` first");
  process.exit(1);
}
console.log("Neon Auth base URL:", baseUrl);

// The managed server requires an Origin header (a browser always sends one);
// from Node we present the app's local origin, which Neon pre-approves by
// default (`neon neon-auth domain allow-localhost get`).
const ORIGIN = "http://localhost:3000";

// Wire-level cookie jar. Discovered while wiring this: the @neon/auth vanilla
// adapter replaces per-call onSuccess/onRequest hooks with its own (user hooks
// never fire), but it DOES honor per-call fetchOptions.headers. So we capture
// Set-Cookie by wrapping globalThis.fetch (the adapter's customFetchImpl calls
// it) and replay the jar as a per-call cookie header on session reads. A
// browser does this automatically; Node must do it by hand. No values printed.
const jar = new Map();
const jarHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const response = await realFetch(url, init);
  try {
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const pair = cookie.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  } catch {
    // best-effort capture; a failure surfaces at the session read
  }
  return response;
};

const clientOptions = { fetchOptions: { headers: { origin: ORIGIN } } };

const email = `neon-e2e-${Date.now()}-${randomBytes(3).toString("hex")}@example.com`;
const password = randomBytes(18).toString("base64url"); // never printed
const name = "Neon E2E Test";

function printUser(label, user) {
  console.log(`${label}:`);
  console.log(`  id            = ${user.id}`);
  console.log(`  email         = ${user.email}`);
  console.log(`  name          = ${user.name}`);
  console.log(`  emailVerified = ${user.emailVerified}`);
  console.log(`  createdAt     = ${user.createdAt}`);
}

let failed = false;
try {
  // 1) Sign up a real user (its Set-Cookie lands in the jar via the fetch shim).
  const client = createAuthClient(baseUrl, clientOptions);
  const signUp = await client.signUp.email({ email, password, name });
  if (signUp.error || !signUp.data?.user) {
    throw new Error(
      `sign-up failed: ${signUp.error?.status ?? ""} ${signUp.error?.message ?? "no user returned"}`,
    );
  }
  printUser("Signed up user", signUp.data.user);

  // 2) Read the current user back (replay the session cookie per call).
  const session = await client.getSession({
    fetchOptions: { headers: { origin: ORIGIN, cookie: jarHeader() } },
  });
  const current = session.data?.user;
  if (!current) throw new Error("getSession returned no current user");
  printUser("Current user (getSession)", current);
  if (current.id !== signUp.data.user.id || current.email !== email) {
    throw new Error("session user does not match the signed-up user");
  }
  console.log("MATCH: session user id/email equal the signed-up user");

  // 3) Password login round-trip from a fresh client and an empty jar.
  jar.clear();
  const fresh = createAuthClient(baseUrl, clientOptions);
  const signIn = await fresh.signIn.email({ email, password });
  if (signIn.error || !signIn.data?.user) {
    throw new Error(`sign-in failed: ${signIn.error?.message ?? "no user returned"}`);
  }
  const again = await fresh.getSession({
    fetchOptions: { headers: { origin: ORIGIN, cookie: jarHeader() } },
  });
  if (!again.data?.user) throw new Error("post-sign-in session returned no user");
  console.log(`SIGN-IN OK: ${again.data.user.email}`);
} catch (err) {
  failed = true;
  console.error("FAIL:", err instanceof Error ? err.message : err);
}

console.log(failed ? "RESULT: FAILED" : "RESULT: OK (sign-up + read-back + sign-in)");
process.exit(failed ? 1 : 0);
