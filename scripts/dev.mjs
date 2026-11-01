#!/usr/bin/env node
/**
 * One documented command that starts web, API, and worker for local
 * development (ticket 01: "one documented command"). Root script: `pnpm dev`.
 *
 * - Ensures the local dev environment is up (embedded Postgres + Mailpit,
 *   scripts/dev-env.mjs) and runs the idempotent admin bootstrap +
 *   migrations when needed.
 * - Builds the API and worker dists if missing (web runs `next dev`, which
 *   compiles itself).
 * - Spawns the three processes with their allowlisted child environments
 *   (the same `buildChildEnv` the production supervisor uses) and prefixes
 *   their logs.
 *
 * Environment comes from `.env` (see .env.example); role passwords for the
 * bootstrap are read from the same file.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { loadEnvFile, repoRoot } from "./lib/env-file.mjs";
import { devEnvStatus, ensureDevEnv } from "./dev-env.mjs";

const ROOT = repoRoot();
const require = createRequire(join(ROOT, "apps/api/package.json"));
const { buildChildEnv } = require("@myform/config");

const fileEnv = loadEnvFile([join(ROOT, ".env")]).vars;
const env = { ...fileEnv, ...process.env };

const WEB_PORT = env["WEB_PORT"] ?? "3000";
const API_PORT = env["API_PORT"] ?? "4000";

async function main() {
  const status = await devEnvStatus(ROOT, env);
  if (status.postgres !== "up") {
    process.stdout.write("[dev] local dev environment is down — starting it...\n");
    await ensureDevEnv(ROOT, env);
  }

  // Idempotent one-time admin bootstrap + migrations (no-op when current).
  await runToCompletion(
    "db:bootstrap",
    process.execPath,
    [join(ROOT, "packages/db/dist/cli.js"), "bootstrap"],
    {
      ADMIN_DATABASE_URL:
        env["ADMIN_DATABASE_URL"] ??
        `postgres://postgres:${env["DEV_ENV_PG_SUPERUSER_PASSWORD"] ?? "postgres"}@127.0.0.1:${env["DEV_ENV_PG_PORT"] ?? 54329}/myform`,
      MIGRATOR_PASSWORD: env["MIGRATOR_PASSWORD"],
      APP_USER_PASSWORD: env["APP_USER_PASSWORD"],
      WORKER_USER_PASSWORD: env["WORKER_USER_PASSWORD"],
    },
  );
  await runToCompletion(
    "db:migrate",
    process.execPath,
    [join(ROOT, "packages/db/dist/cli.js"), "migrate"],
    {
      MIGRATOR_DATABASE_URL:
        env["MIGRATOR_DATABASE_URL"] ??
        `postgres://migrator:${env["MIGRATOR_PASSWORD"]}@127.0.0.1:${env["DEV_ENV_PG_PORT"] ?? 54329}/myform`,
    },
  );

  // API and worker run from dist; build them if missing.
  for (const dist of ["apps/api/dist/main.js", "apps/worker/dist/main.js"]) {
    if (!existsSync(join(ROOT, dist))) {
      process.stdout.write(`[dev] building missing ${dist}...\n`);
      await runToCompletion("build", "pnpm", ["--filter", "@myform/api", "--filter", "@myform/worker", "run", "build"], {});
    }
  }

  const baseEnv = {
    PATH: process.env["PATH"] ?? "",
    HOME: process.env["HOME"] ?? "",
    TMPDIR: process.env["TMPDIR"] ?? "",
    LANG: process.env["LANG"] ?? "",
  };
  const shared = {
    MYFORM_ENV: env["MYFORM_ENV"] ?? "development",
    APP_ORIGIN: env["APP_ORIGIN"] ?? `http://localhost:${WEB_PORT}`,
  };

  const children = [];
  const prefixed = (name, stream) => (chunk) => {
    for (const line of chunk.toString().split("\n")) {
      if (line.length > 0) stream.write(`[${name}] ${line}\n`);
    }
  };
  const startService = (name, command, args, childEnv, cwd = ROOT) => {
    const child = spawn(command, args, { cwd, env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout?.on("data", prefixed(name, process.stdout));
    child.stderr?.on("data", prefixed(name, process.stderr));
    children.push(child);
    return child;
  };

  startService(
    "web",
    process.execPath,
    [join(ROOT, "apps/web/node_modules/next/dist/bin/next"), "dev", "-p", String(WEB_PORT)],
    {
      ...baseEnv,
      ...buildChildEnv("web", {
        MYFORM_ENV: shared.MYFORM_ENV,
        APP_ORIGIN: shared.APP_ORIGIN,
        INTERNAL_API_URL: env["INTERNAL_API_URL"] ?? `http://127.0.0.1:${API_PORT}`,
      }),
    },
    join(ROOT, "apps/web"),
  );
  startService("api", process.execPath, [join(ROOT, "apps/api/dist/main.js")], {
    ...baseEnv,
    ...buildChildEnv("api", {
      ...shared,
      LOG_LEVEL: env["LOG_LEVEL"] ?? "info",
      DATABASE_URL: env["DATABASE_URL"],
    }),
    API_PORT: String(API_PORT),
  });
  startService("worker", process.execPath, [join(ROOT, "apps/worker/dist/main.js")], {
    ...baseEnv,
    ...buildChildEnv("worker", {
      MYFORM_ENV: shared.MYFORM_ENV,
      LOG_LEVEL: env["LOG_LEVEL"] ?? "info",
      WORKER_DATABASE_URL: env["WORKER_DATABASE_URL"],
      WORKER_HEARTBEAT_MS: env["WORKER_HEARTBEAT_MS"] ?? "15000",
    }),
  });

  process.stdout.write(
    [
      "",
      "[dev] all three services running:",
      `  web    http://localhost:${WEB_PORT}`,
      `  api    http://127.0.0.1:${API_PORT} (internal; web proxies /v1/*)`,
      `  worker heartbeat every ${env["WORKER_HEARTBEAT_MS"] ?? 15000}ms`,
      "  press Ctrl+C to stop",
      "",
    ].join("\n"),
  );

  let stopping = false;
  const shutdown = (code) => {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill("SIGTERM");
    setTimeout(() => process.exit(code), 2_000).unref();
  };
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
  for (const child of children) {
    child.on("exit", () => shutdown(1));
  }
}

function runToCompletion(name, command, args, extraEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const prefixed = (stream) => (chunk) => {
      for (const line of chunk.toString().split("\n")) {
        if (line.length > 0) stream.write(`[${name}] ${line}\n`);
      }
    };
    child.stdout?.on("data", prefixed(process.stdout));
    child.stderr?.on("data", prefixed(process.stderr));
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${name} exited with ${code}`))));
  });
}

main().catch((error) => {
  process.stderr.write(`[dev] failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
