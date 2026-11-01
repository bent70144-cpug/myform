import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { runMigrations, startTestPostgres, type TestPostgres } from "@myform/db";
import { buildChildEnv } from "@myform/config";
import {
  dumpOnFailure,
  freePort,
  paths,
  spawnCaptured,
  waitForHttp,
  type SpawnedProcess,
} from "./helpers.js";

/**
 * Spike proofs 2, 3 and 7 — the full browser-hop topology against REAL
 * ports and REAL child processes (recording: this test uses real ports,
 * not supertest):
 *
 *   proof 2 — Next.js /v1/* rewrite reaches NestJS and a Set-Cookie
 *             response round-trips back through the rewrite.
 *   proof 3 — Better Auth 1.7.15 mounted in NestJS under /v1/auth with
 *             Drizzle against the non-public `auth` schema completes a
 *             sign-up + session round trip (also through the rewrite, the
 *             way the browser will do it).
 *   proof 7 — what peer address and forwarded headers NestJS actually
 *             sees behind the rewrite (recorded to artifacts/ for ticket
 *             04's trusted-proxy tests).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let testDb: TestPostgres;
let api: SpawnedProcess | undefined;
let next: SpawnedProcess | undefined;
let apiPort = 0;
let webPort = 0;
let webOrigin = "";
let apiOrigin = "";

beforeAll(async () => {
  testDb = await startTestPostgres();
  // Spike fixture (auth tables + RLS fixture) applied by the real migrator.
  await runMigrations({
    uri: testDb.migratorUrl,
    migrationsDir: `${paths.spikeRoot}/migrations`,
  });

  apiPort = await freePort();
  webPort = await freePort();
  webOrigin = `http://127.0.0.1:${webPort}`;
  apiOrigin = `http://127.0.0.1:${apiPort}`;

  api = spawnCaptured(process.execPath, [paths.spikeApiMain], {
    env: {
      PATH: process.env["PATH"] ?? "",
      NODE_ENV: "production",
      MYFORM_ENV: "test",
      LOG_LEVEL: "error",
      API_PORT: String(apiPort),
      APP_ORIGIN: webOrigin,
      DATABASE_URL: testDb.appUrl,
      BETTER_AUTH_SECRET: "spike-better-auth-secret-do-not-use",
    },
  });
  await waitForHttp(`${apiOrigin}/v1/health`, 60_000).catch((error) => {
    dumpOnFailure("spike api stderr", api!.stderr);
    dumpOnFailure("spike api stdout", api!.stdout);
    throw error;
  });

  next = spawnCaptured(
    process.execPath,
    [paths.nextBin, "build"],
    { cwd: paths.webappRoot, env: buildChildEnv("web", { PATH: process.env["PATH"] ?? "", NODE_ENV: "production", INTERNAL_API_URL: apiOrigin, APP_ORIGIN: webOrigin }) },
  );
  const buildCode = await new Promise<number | null>((resolve, reject) => {
    next!.child.on("exit", (code) => resolve(code));
    next!.child.on("error", reject);
  });
  if (buildCode !== 0) {
    dumpOnFailure("next build stderr", next!.stderr);
    throw new Error(`next build failed (${buildCode})`);
  }
  next.stop();
  next = spawnCaptured(process.execPath, [paths.nextBin, "start", "-p", String(webPort)], {
    cwd: paths.webappRoot,
    env: buildChildEnv("web", { PATH: process.env["PATH"] ?? "", NODE_ENV: "production", INTERNAL_API_URL: apiOrigin, APP_ORIGIN: webOrigin }),
  });
  await waitForHttp(`${webOrigin}/`, 60_000).catch((error) => {
    dumpOnFailure("next stderr", next!.stderr);
    dumpOnFailure("next stdout", next!.stdout);
    throw error;
  });
}, 300_000);

afterAll(async () => {
  next?.stop();
  api?.stop();
  await testDb?.stop();
});

describe("proof 2 — rewrite + Set-Cookie round trip", () => {
  it("a request through Next reaches NestJS", async () => {
    const res = await fetch(`${webOrigin}/v1/whoami`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { seenBy: string };
    // The rewrite really landed on the internal NestJS API.
    expect(body.seenBy).toBe("nestjs");
  });

  it("a Set-Cookie response round-trips back through the rewrite", async () => {
    const setRes = await fetch(`${webOrigin}/v1/cookie/set`);
    expect(setRes.status).toBe(200);
    const setCookie = setRes.headers.getSetCookie();
    expect(setCookie.length).toBeGreaterThan(0);
    const cookie = setCookie.find((c) => c.startsWith("myform_spike_cookie="));
    expect(cookie).toBeDefined();
    // First-party cookie attributes survive the hop unchanged.
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");

    const echoRes = await fetch(`${webOrigin}/v1/cookie/echo`, {
      headers: { cookie: cookie!.split(";")[0]! },
    });
    expect(echoRes.status).toBe(200);
    const echo = (await echoRes.json()) as { received: string | null };
    expect(echo.received).toBe("myform_spike_cookie=round-trip-1");
  });
});

describe("proof 3 — Better Auth in NestJS under /v1/auth", () => {
  const email = `spike-${Date.now()}@example.test`;
  const password = "spike-password-123";
  let userId = "";
  let sessionCookie = "";

  it("sign-up through the /v1/* rewrite creates a UUID user and sets the session cookie", async () => {
    const res = await fetch(`${webOrigin}/v1/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // A browser always sends Origin on cookie-authenticated mutations
        // (spec: global Origin check). better-auth 1.7.15 rejects POSTs
        // without one (MISSING_OR_NULL_ORIGIN) — a finding recorded in
        // spike/DECISIONS.md.
        origin: webOrigin,
      },
      body: JSON.stringify({ name: "Spike User", email, password }),
    });
    if (res.status !== 200) {
      dumpOnFailure("sign-up error body", await res.text());
    }
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string; email: string } };
    userId = body.user.id;
    expect(body.user.email).toBe(email);
    // THE DECISION UNDER TEST (ADR-0004): the user id is a UUID.
    expect(userId).toMatch(UUID_RE);
    const cookies = res.headers.getSetCookie();
    sessionCookie = cookies.find((c) => c.startsWith("better-auth.session_token=")) ?? "";
    expect(sessionCookie).not.toBe("");
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie.toLowerCase()).toContain("samesite=lax");
  });

  it("get-session round-trips through the rewrite with the cookie", async () => {
    const res = await fetch(`${webOrigin}/v1/auth/get-session`, {
      headers: { cookie: sessionCookie.split(";")[0]! },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string } | null };
    expect(body.user?.id).toBe(userId);
  });

  it("get-session also works directly on the internal API port (SSR path)", async () => {
    const res = await fetch(`${apiOrigin}/v1/auth/get-session`, {
      headers: { cookie: sessionCookie.split(";")[0]! },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string } | null };
    expect(body.user?.id).toBe(userId);
  });

  it("get-session without a cookie returns no session", async () => {
    const res = await fetch(`${apiOrigin}/v1/auth/get-session`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeNull();
  });

  it("stored auth rows live in the non-public auth schema with UUID ids", async () => {
    const migrator = new Client({ connectionString: testDb.migratorUrl });
    await migrator.connect();
    try {
      const users = await migrator.query<{
        id: string;
        email: string;
        email_verified: boolean;
      }>(`SELECT id, email, email_verified FROM auth."user" WHERE email = $1`, [email]);
      expect(users.rows).toHaveLength(1);
      expect(users.rows[0]!.id).toMatch(UUID_RE);
      expect(users.rows[0]!.id).toBe(userId);
      expect(users.rows[0]!.email_verified).toBe(false);

      const sessions = await migrator.query<{ user_id: string; expires_at: Date }>(
        `SELECT user_id, expires_at FROM auth.session`,
      );
      const session = sessions.rows.find((r) => r.user_id === userId);
      expect(session).toBeDefined();
      expect(new Date(session!.expires_at).getTime()).toBeGreaterThan(Date.now() + 5 * 86_400_000);
      // Session token is the cookie value's token part (server-side session storage).
      expect(sessionCookie).toContain("better-auth.session_token=");
    } finally {
      await migrator.end();
    }
  });
});

describe("proof 7 — proxy chain recording (for ticket 04)", () => {
  interface WhoAmI {
    seenBy: string;
    peer: {
      remoteAddress: string | undefined;
      remotePort: number | undefined;
      ip: string | undefined;
      trustProxy: unknown;
    };
    headers: Record<string, string | string[] | undefined>;
    httpVersion: string;
  }

  it("records what NestJS sees through the Next rewrite and writes the artifact", async () => {
    const throughNext = await fetch(`${webOrigin}/v1/whoami`);
    expect(throughNext.status).toBe(200);
    const proxied = (await throughNext.json()) as WhoAmI;

    const direct = await fetch(`${apiOrigin}/v1/whoami`);
    const directReport = (await direct.json()) as WhoAmI;

    mkdirSync(paths.artifactsDir, { recursive: true });
    writeFileSync(
      `${paths.artifactsDir}/proxy-chain.json`,
      `${JSON.stringify(
        {
          recordedAt: new Date().toISOString(),
          viaNextRewrite: proxied,
          directToApi: directReport,
          notes: [
            "Client: Node fetch on 127.0.0.1 → Next.js (public port) → rewrite → NestJS (internal port).",
            "Express `trust proxy` is NOT set in the spike API, so peer.ip is the raw socket address.",
            "FINDING: the Next 16 rewrite sets only x-forwarded-host; x-forwarded-for and x-forwarded-proto are ABSENT on the internal hop.",
            "TICKET 04: the client IP must come from the edge-provided x-forwarded-for that Next itself received (Render/Cloudflare hop), forwarded explicitly; the internal peer is always 127.0.0.1.",
          ],
        },
        null,
        2,
      )}\n`,
    );

    // The hop is real: NestJS sees the Next.js server, not the API's own port.
    expect(proxied.seenBy).toBe("nestjs");
    expect(proxied.peer.remoteAddress).toBeTruthy();
    // Next proxies from loopback — the peer address is a loopback address.
    expect(["127.0.0.1", "::1", "::ffff:127.0.0.1"]).toContain(proxied.peer.remoteAddress);
    // FINDING: Next 16's rewrite proxy sets x-forwarded-host (the original
    // public host the browser called) but does NOT add x-forwarded-for or
    // x-forwarded-proto on the internal hop. Ticket 04 cannot derive the
    // client IP inside NestJS from the rewrite hop alone — it must trust
    // the forwarded value from the platform edge (Render) that Next
    // received, or have middleware forward it explicitly.
    expect(typeof proxied.headers["x-forwarded-host"]).toBe("string");
    expect(proxied.headers["x-forwarded-host"]).toContain(":");
    expect(proxied.headers["x-forwarded-for"]).toBeUndefined();
    expect(proxied.headers["x-forwarded-proto"]).toBeUndefined();
    // The original public host is preserved, the API's own port is not leaked.
    expect(proxied.headers["x-forwarded-host"]).not.toBe(proxied.headers["host"]);
    // Direct calls (internal SSR path) see the caller's loopback address with
    // NO forwarded headers — spoofed headers cannot originate here.
    expect(directReport.headers["x-forwarded-for"]).toBeUndefined();
    expect(directReport.headers["x-forwarded-host"]).toBeUndefined();
  });
});
