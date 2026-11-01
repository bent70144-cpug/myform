#!/usr/bin/env node
/**
 * Alpha production supervisor (spec: "Deployment and configuration").
 * One Render web service starts three children:
 *
 *   web     Next.js (`next start`) on the public $PORT
 *   api     NestJS (apps/api/dist/main.js) on the internal $API_PORT
 *   worker  inline pg-boss consumer (apps/worker/dist/main.js)
 *
 * Each child is spawned with an explicit allowlisted environment built by
 * `buildChildEnv` (@myform/config): Next receives only public variables and
 * the internal API URL — never DATABASE_URL, auth secrets, or the migrator
 * URL. A test fails if a forbidden key reaches the Next process env.
 *
 * Usage (Render start command): `node scripts/supervisor.mjs`
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { repoRoot } from "./lib/env-file.mjs";

const ROOT = repoRoot();
const require = createRequire(join(ROOT, "apps/api/package.json"));
const { buildChildEnv } = require("@myform/config");

const PUBLIC_PORT = process.env["PORT"] ?? process.env["WEB_PORT"] ?? "3000";
const API_PORT = process.env["API_PORT"] ?? "4000";

if (!process.env["DATABASE_URL"]) {
  process.stderr.write("supervisor: DATABASE_URL is required (API child env)\n");
  process.exit(1);
}
if (!process.env["WORKER_DATABASE_URL"]) {
  process.stderr.write("supervisor: WORKER_DATABASE_URL is required (worker child env)\n");
  process.exit(1);
}

for (const dist of ["apps/api/dist/main.js", "apps/worker/dist/main.js"]) {
  if (!existsSync(join(ROOT, dist))) {
    process.stderr.write(`supervisor: ${dist} missing — run \`pnpm build\` first\n`);
    process.exit(1);
  }
}

const children = [];

function prefixed(name, stream) {
  return (chunk) => {
    for (const line of chunk.toString().split("\n")) {
      if (line.length > 0) stream.write(`[${name}] ${line}\n`);
    }
  };
}

function startService(name, command, args, childEnv, cwd = ROOT) {
  const child = spawn(command, args, {
    cwd,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", prefixed(name, process.stdout));
  child.stderr?.on("data", prefixed(name, process.stderr));
  child.on("exit", (code, signal) => {
    process.stderr.write(`[supervisor] ${name} exited (code=${code} signal=${signal})\n`);
    // One child dying takes the service down: the platform restarts it.
    shutdown(1);
  });
  children.push(child);
  return child;
}

const baseEnv = { PATH: process.env["PATH"] ?? "", HOME: process.env["HOME"] ?? "", TMPDIR: process.env["TMPDIR"] ?? "", LANG: process.env["LANG"] ?? "" };

startService("web", process.execPath, [join(ROOT, "apps/web/node_modules/next/dist/bin/next"), "start", "-p", PUBLIC_PORT], {
  ...baseEnv,
  ...buildChildEnv("web", process.env),
  PORT: PUBLIC_PORT,
}, join(ROOT, "apps/web"));
startService("api", process.execPath, [join(ROOT, "apps/api/dist/main.js")], {
  ...baseEnv,
  ...buildChildEnv("api", process.env),
  API_PORT,
});
startService("worker", process.execPath, [join(ROOT, "apps/worker/dist/main.js")], {
  ...baseEnv,
  ...buildChildEnv("worker", process.env),
});

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
  setTimeout(() => process.exit(code), 3_000).unref();
}
process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

process.stdout.write(
  `[supervisor] web on :${PUBLIC_PORT}, api on :${API_PORT}, worker inline\n`,
);
