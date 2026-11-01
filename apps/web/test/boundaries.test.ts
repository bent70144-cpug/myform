import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { join } from "node:path";
import { ESLint } from "eslint";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// The no-restricted-imports boundary targets the web app's production
// imports; this dev-time test needs the embedded-postgres helper to prove
// the rewrite hop against a real Postgres. The disable is explicit and
// reviewed.
// eslint-disable-next-line no-restricted-imports
import { startTestPostgres, type TestPostgres } from "@myform/db";
import { buildChildEnv, FORBIDDEN_WEB_ENV_KEYS, loadEnv, webEnvSchema } from "@myform/config";

const WEB_ROOT = join(__dirname, "..");
const REPO_ROOT = join(WEB_ROOT, "..", "..");

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address !== "string" ? address.port : 0;
      server.close(() => (port ? resolve(port) : reject(new Error("no free port"))));
    });
    server.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Lint boundary: the web build/lint must FAIL if web imports the database
// package or the server auth entrypoint (spec: "Engineering guardrails").
// ---------------------------------------------------------------------------

async function lintProbe(code: string): Promise<{ ruleFailures: string[]; messages: string[] }> {
  const eslint = new ESLint({ cwd: WEB_ROOT });
  const results = await eslint.lintText(code, { filePath: join(WEB_ROOT, "src/app/probe.ts") });
  const messages = results[0]?.messages.map((m) => `${m.ruleId ?? "?"}: ${m.message}`) ?? [];
  return {
    ruleFailures: messages.filter((m) => m.startsWith("no-restricted-imports")),
    messages,
  };
}

describe("web import boundaries (lint must fail)", () => {
  it("fails when web imports the database package", async () => {
    const result = await lintProbe(`import { Pool } from "@myform/db";\nexport const p = Pool;\n`);
    expect(result.ruleFailures.length).toBeGreaterThan(0);
  });

  it("fails for deep imports into the database package", async () => {
    const result = await lintProbe(
      `import { runMigrations } from "@myform/db/dist/migrator.js";\nexport const p = runMigrations;\n`,
    );
    expect(result.ruleFailures.length).toBeGreaterThan(0);
  });

  it("fails when web imports the server auth entrypoint", async () => {
    const result = await lintProbe(
      `import { createBetterAuthInstance } from "@myform/auth/server";\nexport const p = createBetterAuthInstance;\n`,
    );
    expect(result.ruleFailures.length).toBeGreaterThan(0);
  });

  it("allows the client auth entrypoint and other packages", async () => {
    const result = await lintProbe(
      `import { fetchSession } from "@myform/auth";\nimport { t } from "@myform/i18n";\nexport const p = [fetchSession, t];\n`,
    );
    expect(result.ruleFailures).toEqual([]);
    expect(result.messages).toEqual([]);
  });

  it("the guard is wired into the linted eslint config file itself", () => {
    const config = readFileSync(join(WEB_ROOT, "eslint.config.mjs"), "utf8");
    expect(config).toContain("@myform/db");
    expect(config).toContain("@myform/auth/server");
  });
});

// ---------------------------------------------------------------------------
// Environment boundary: the supervisor's child environment allowlist must
// keep DATABASE_URL, auth secrets, and the migrator URL out of the Next
// process environment (spec: "Deployment and configuration", guardrails).
// ---------------------------------------------------------------------------

describe("web process environment boundary", () => {
  const fullServerEnv: Record<string, string> = {
    PATH: "/usr/bin",
    HOME: "/home/dev",
    MYFORM_ENV: "development",
    APP_ORIGIN: "http://localhost:3000",
    INTERNAL_API_URL: "http://127.0.0.1:4000",
    // Secrets present in the supervisor's own environment:
    DATABASE_URL: "postgres://app_user:secret@db/myform",
    WORKER_DATABASE_URL: "postgres://worker_user:secret@db/myform",
    MIGRATOR_DATABASE_URL: "postgres://migrator:secret@db/myform",
    ADMIN_DATABASE_URL: "postgres://postgres:secret@db/myform",
    MIGRATOR_PASSWORD: "secret",
    APP_USER_PASSWORD: "secret",
    WORKER_USER_PASSWORD: "secret",
    AUTH_SECRET: "secret",
  };

  it("buildChildEnv('web') passes only the allowlisted public variables", () => {
    const childEnv = buildChildEnv("web", fullServerEnv);
    const keys = Object.keys(childEnv);
    expect(keys.sort()).toEqual(["APP_ORIGIN", "HOME", "INTERNAL_API_URL", "MYFORM_ENV", "PATH"]);
  });

  it("drops every forbidden key from the Next process environment", () => {
    const childEnv = buildChildEnv("web", fullServerEnv);
    for (const key of FORBIDDEN_WEB_ENV_KEYS) {
      expect(childEnv[key], `${key} must never reach the web process`).toBeUndefined();
    }
  });

  it("keeps the web env schema strict against credential keys", () => {
    for (const key of FORBIDDEN_WEB_ENV_KEYS) {
      expect(() => loadEnv(webEnvSchema, { [key]: "leak" })).toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Real rewrite hop: /v1/* through the Next.js server reaches the API over
// the internal URL — the browser → Next rewrite → API seam from the spec,
// with GET /v1/health served end to end against a real Postgres.
// ---------------------------------------------------------------------------

let testDb: TestPostgres;
let apiProcess: ChildProcess | undefined;
let webProcess: ChildProcess | undefined;

beforeAll(async () => {
  testDb = await startTestPostgres();
}, 180_000);

afterAll(async () => {
  apiProcess?.kill("SIGTERM");
  webProcess?.kill("SIGTERM");
  await testDb?.stop();
});

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
      lastError = `status ${res.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`service at ${url} not ready: ${lastError}`);
}

describe("GET /v1/health through the Next.js /v1/* rewrite", () => {
  it(
    "proxies browser calls to the API over the internal URL",
    async () => {
      const apiPort = await freePort();
      const webPort = await freePort();

      const api = spawn(process.execPath, [join(REPO_ROOT, "apps/api/dist/main.js")], {
        env: {
          NODE_ENV: "test",
          PATH: process.env["PATH"] ?? "",
          MYFORM_ENV: "test",
          LOG_LEVEL: "error",
          API_PORT: String(apiPort),
          APP_ORIGIN: "http://localhost:3000",
          DATABASE_URL: testDb.appUrl,
        },
        stdio: ["ignore", "ignore", "pipe"],
      });
      apiProcess = api;
      let apiStderr = "";
      api.stderr?.on("data", (chunk: Buffer) => {
        apiStderr += chunk.toString();
      });

      const web = spawn(
        process.execPath,
        [join(REPO_ROOT, "apps/web/node_modules/next/dist/bin/next"), "dev", "-p", String(webPort)],
        {
          cwd: WEB_ROOT,
          env: {
            NODE_ENV: "development",
            PATH: process.env["PATH"] ?? "",
            MYFORM_ENV: "test",
            APP_ORIGIN: "http://localhost:3000",
            INTERNAL_API_URL: `http://127.0.0.1:${apiPort}`,
          },
          stdio: ["ignore", "ignore", "pipe"],
        },
      );
      webProcess = web;
      let webErr = "";
      web.stderr?.on("data", (chunk: Buffer) => {
        webErr += chunk.toString();
      });

      try {
        await waitForHttp(`http://127.0.0.1:${apiPort}/v1/health`, 30_000);
        await waitForHttp(`http://127.0.0.1:${webPort}/`, 120_000);

        // The actual seam under test: the same-origin rewrite.
        const res = await fetch(`http://127.0.0.1:${webPort}/v1/health`);
        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toBe("no-store");
        const body = (await res.json()) as {
          status: string;
          checks: { database: string };
          service: string;
        };
        expect(body).toEqual({ status: "ok", checks: { database: "up" }, service: "api" });
      } catch (error) {
        if (apiStderr) process.stderr.write(`api stderr:\n${apiStderr}\n`);
        if (webErr) process.stderr.write(`web stderr:\n${webErr}\n`);
        throw error;
      }
    },
    180_000,
  );
});
