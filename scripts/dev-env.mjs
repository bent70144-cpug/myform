#!/usr/bin/env node
/**
 * Local development environment (the documented Docker substitute, see
 * notes/local-env.md and docs/adr/0002):
 *
 *   node scripts/dev-env.mjs start|stop|status
 *   pnpm local:up / local:down / local:status
 *
 * - Postgres 17 via the `@embedded-postgres/linux-x64` binaries (no root,
 *   no daemon): initdb into `.local/dev-env/pg`, started/stopped with
 *   `pg_ctl` so the server outlives this script.
 * - Mailpit as a static Go binary (downloaded on first run into
 *   `.local/dev-env/bin`), SMTP on 127.0.0.1:1025, UI on 127.0.0.1:8025.
 *
 * After the first `start`, the one-time admin bootstrap + migrations run
 * via packages/db (`pnpm db:bootstrap`, `pnpm db:migrate`) with role
 * passwords from the environment — never stored in SQL files.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";
import { repoRoot } from "./lib/env-file.mjs";

const MAILPIT_VERSION = "1.33.0";
const MAILPIT_URL = `https://github.com/axllent/mailpit/releases/download/v${MAILPIT_VERSION}/mailpit-linux-amd64.tar.gz`;

function pgBin(root, name) {
  const candidates = [
    join(root, "packages/db/node_modules/@embedded-postgres/linux-x64/native/bin"),
    join(root, "node_modules/@embedded-postgres/linux-x64/native/bin"),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "pg_ctl"))) return join(dir, name);
  }
  throw new Error("embedded-postgres binaries not found — run `pnpm install` first (see docs/adr/0002)");
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", ...options });
  return result.status ?? 1;
}

function runCapture(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { encoding: "utf8", ...options });
  return { status: result.status ?? 1, stdout: result.stdout ?? "" };
}

async function portOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.connect({ port: Number(port), host });
    socket.setTimeout(700);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

/** Snapshot of the local dev environment, used by status and `pnpm dev`. */
export async function devEnvStatus(root, env) {
  const pgPort = Number(env["DEV_ENV_PG_PORT"] ?? 54329);
  const stateDir = join(root, ".local", "dev-env");
  const mailpitPidFile = join(stateDir, "mailpit.pid");
  let mailpit = "down";
  if (existsSync(mailpitPidFile)) {
    try {
      process.kill(Number(readFileSync(mailpitPidFile, "utf8").trim()), 0);
      mailpit = "up";
    } catch {
      mailpit = "down";
    }
  }
  return {
    postgres: (await portOpen(pgPort)) ? "up" : "down",
    mailpit,
    pgPort,
    smtpPort: Number(env["MAILPIT_SMTP_PORT"] ?? 1025),
    httpPort: Number(env["MAILPIT_HTTP_PORT"] ?? 8025),
  };
}

async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!(await portOpen(port))) {
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 200));
  }
  return true;
}

/**
 * Bring Postgres + Mailpit up (idempotent). Exits the process on failure
 * when used from the CLI; throws when imported.
 */
export async function ensureDevEnv(root, env, { fatal = false } = {}) {
  const stateDir = join(root, ".local", "dev-env");
  const pgDir = join(stateDir, "pg");
  const binDir = join(stateDir, "bin");
  const pgLog = join(stateDir, "postgres.log");
  const mailpitPid = join(stateDir, "mailpit.pid");
  const pgPort = Number(env["DEV_ENV_PG_PORT"] ?? 54329);
  const smtpPort = Number(env["MAILPIT_SMTP_PORT"] ?? 1025);
  const httpPort = Number(env["MAILPIT_HTTP_PORT"] ?? 8025);
  const superuser = "postgres";
  const superuserPassword = env["DEV_ENV_PG_SUPERUSER_PASSWORD"] ?? "postgres";
  const database = "myform";

  const die = (message, code = 1) => {
    if (fatal) {
      process.stderr.write(`${message}\n`);
      process.exit(code);
    }
    throw new Error(message);
  };

  mkdirSync(stateDir, { recursive: true });

  if (!(await portOpen(pgPort))) {
    if (!existsSync(pgDir)) {
      const pwfile = join(stateDir, "pwfile");
      writeFileSync(pwfile, superuserPassword);
      const init = run(pgBin(root, "initdb"), [
        "-D",
        pgDir,
        "-U",
        superuser,
        `--pwfile=${pwfile}`,
        "-E",
        "UTF8",
        "--auth=md5",
      ]);
      rmSync(pwfile);
      if (init !== 0) die("initdb failed", init);
    }
    const start = run(
      pgBin(root, "pg_ctl"),
      ["-D", pgDir, "-l", pgLog, "-o", `-p ${pgPort} -h 127.0.0.1 -k ${stateDir}`, "start"],
    );
    if (start !== 0) die("pg_ctl start failed", start);
    if (!(await waitForPort(pgPort, 20_000))) {
      die(`postgres did not become ready; see ${pgLog}`);
    }
  }

  // Ensure the myform database exists. The embedded distribution ships no
  // psql/createdb client binaries, so use the `pg` driver from packages/db.
  const requireFromDb = (await import("node:module")).createRequire(
    join(root, "packages/db/package.json"),
  );
  const { Client } = requireFromDb("pg");
  const client = new Client({
    host: "127.0.0.1",
    port: pgPort,
    user: superuser,
    password: superuserPassword,
    database: "postgres",
  });
  await client.connect();
  try {
    const known = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
    if (known.rowCount === 0) {
      await client.query(`CREATE DATABASE "${database}"`);
    }
  } finally {
    await client.end();
  }

  // Mailpit.
  const binary = join(binDir, "mailpit");
  if (!existsSync(binary)) {
    mkdirSync(binDir, { recursive: true });
    const tarball = join(binDir, "mailpit.tar.gz");
    process.stdout.write(`downloading Mailpit v${MAILPIT_VERSION}...\n`);
    const curl = run("curl", ["-sL", "-o", tarball, MAILPIT_URL]);
    if (curl !== 0) die("mailpit download failed", curl);
    const tar = run("tar", ["-xzf", tarball, "-C", binDir, "mailpit"]);
    rmSync(tarball);
    if (tar !== 0) die("mailpit extraction failed", tar);
  }
  let mailpitRunning = false;
  if (existsSync(mailpitPid)) {
    try {
      process.kill(Number(readFileSync(mailpitPid, "utf8").trim()), 0);
      mailpitRunning = true;
    } catch {
      rmSync(mailpitPid, { force: true });
    }
  }
  if (!mailpitRunning) {
    const child = spawn(binary, ["-s", `127.0.0.1:${smtpPort}`, "-l", `127.0.0.1:${httpPort}`], {
      stdio: ["ignore", "ignore", "ignore"],
      detached: true,
    });
    child.unref();
    writeFileSync(mailpitPid, String(child.pid));
  }
}

async function stop(root) {
  const stateDir = join(root, ".local", "dev-env");
  const pgDir = join(stateDir, "pg");
  const mailpitPid = join(stateDir, "mailpit.pid");
  if (existsSync(mailpitPid)) {
    const pid = Number(readFileSync(mailpitPid, "utf8").trim());
    try {
      process.kill(pid, "SIGTERM");
      process.stdout.write("mailpit stopped\n");
    } catch {
      // already gone
    }
    rmSync(mailpitPid, { force: true });
  }
  if (existsSync(join(pgDir, "postmaster.pid"))) {
    run(pgBin(root, "pg_ctl"), ["-D", pgDir, "stop", "-m", "fast"]);
    process.stdout.write("postgres stopped\n");
  } else {
    process.stdout.write("postgres not running\n");
  }
}

// --- CLI entrypoint -------------------------------------------------------

const invoked = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invoked) {
  const ROOT = repoRoot();
  const { loadEnvFile } = await import("./lib/env-file.mjs");
  const env = { ...loadEnvFile([join(ROOT, ".env")]).vars, ...process.env };
  const command = process.argv[2];
  if (command === "start") {
    await ensureDevEnv(ROOT, env, { fatal: true });
    const status = await devEnvStatus(ROOT, env);
    process.stdout.write(
      [
        "",
        "local dev environment is up:",
        `  postgres     127.0.0.1:${status.pgPort} (db myform; log .local/dev-env/postgres.log)`,
        `  mailpit smtp 127.0.0.1:${status.smtpPort}`,
        `  mailpit ui   http://127.0.0.1:${status.httpPort}`,
        "",
        "next: run the one-time admin bootstrap and migrations (idempotent):",
        "  pnpm db:bootstrap && pnpm db:migrate",
        "",
      ].join("\n"),
    );
  } else if (command === "stop") {
    await stop(ROOT);
  } else if (command === "status") {
    const status = await devEnvStatus(ROOT, env);
    process.stdout.write(
      `postgres: ${status.postgres} (port ${status.pgPort})\nmailpit: ${status.mailpit} (smtp ${status.smtpPort}, ui ${status.httpPort})\n`,
    );
    process.exitCode = status.postgres === "up" ? 0 : 1;
  } else {
    process.stderr.write("usage: node scripts/dev-env.mjs <start|stop|status>\n");
    process.exitCode = 2;
  }
}
