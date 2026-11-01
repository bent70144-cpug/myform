import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { Client } from "pg";
import EmbeddedPostgres from "embedded-postgres";

/**
 * Embedded Postgres fixture (spec-sanctioned Docker substitute — see
 * docs/adr/0001-local-infra-substitutes.md).
 *
 * Boots REAL PostgreSQL 17 binaries on 127.0.0.1:5433 (user `postgres`,
 * password `postgres`). Tests use the real non-superuser roles created by the
 * bootstrap; the initdb superuser only plays the admin for that one-time
 * bootstrap. The fixture reuses a server that is already listening (dev
 * supervisor or `pnpm db:start`) so a single instance serves dev + tests.
 */

export const EMBEDDED_PG = {
  host: "127.0.0.1",
  port: 5433,
  user: "postgres",
  password: "postgres",
  adminDatabase: "postgres",
  devDatabase: "form_dev",
  testDatabase: "form_test",
} as const;

const DATA_DIR = path.join(os.tmpdir(), "form-embedded-pg");
const PID_FILE = path.join(os.tmpdir(), "form-embedded-pg.pid");
/**
 * Written by the STARTER after `form_dev` / `form_test` exist. Consumers that
 * poll the port (the supervisor) must wait for this marker instead of a bare
 * TCP connect: the server accepts connections BEFORE the dev/test databases
 * are created, and a port-open probe in that window races the bootstrap
 * (observed in CI as `database "form_dev" does not exist`).
 */
export const DATABASES_READY_FILE = path.join(
  os.tmpdir(),
  "form-embedded-pg.dbs-ready",
);

let handle: EmbeddedPostgres | null = null;

export function adminUrl(database: string = EMBEDDED_PG.adminDatabase): string {
  return `postgres://${EMBEDDED_PG.user}:${EMBEDDED_PG.password}@${EMBEDDED_PG.host}:${EMBEDDED_PG.port}/${database}`;
}

export async function isPostgresReachable(
  port: number = EMBEDDED_PG.port,
): Promise<boolean> {
  try {
    const client = new Client({
      host: EMBEDDED_PG.host,
      port,
      user: EMBEDDED_PG.user,
      password: EMBEDDED_PG.password,
      database: EMBEDDED_PG.adminDatabase,
      connectionTimeoutMillis: 800,
    });
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: EMBEDDED_PG.host });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

export interface EmbeddedPgHandle {
  started: boolean;
  port: number;
}

/**
 * Boot the embedded cluster unless something already answers on the port.
 * Returns whether THIS process started it (only the starter tears it down).
 */
export async function ensureEmbeddedPostgres(): Promise<EmbeddedPgHandle> {
  if (await isPostgresReachable()) {
    return { started: false, port: EMBEDDED_PG.port };
  }
  if (await isPortOpen(EMBEDDED_PG.port)) {
    // Something non-Postgres occupies the port — fail with a clear message.
    throw new Error(
      `Port ${EMBEDDED_PG.port} is occupied by a non-Postgres process; free it or set a different fixture port.`,
    );
  }

  // Simple lock so two processes cannot initdb the same directory concurrently.
  const lockFile = `${PID_FILE}.lock`;
  const fd = fs.openSync(lockFile, "wx");
  try {
    // Invalidate any marker from a previous run BEFORE starting: consumers
    // must only trust the marker THIS process writes at the end.
    fs.rmSync(DATABASES_READY_FILE, { force: true });
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const needsInit = !fs.existsSync(path.join(DATA_DIR, "PG_VERSION"));
    handle = new EmbeddedPostgres({
      databaseDir: DATA_DIR,
      user: EMBEDDED_PG.user,
      password: EMBEDDED_PG.password,
      port: EMBEDDED_PG.port,
      persistent: true,
    });
    if (needsInit) {
      await handle.initialise();
    }
    await handle.start();
    // Create the dev/test databases with OUR OWN admin client that is ALWAYS
    // ended. WHY: EmbeddedPostgres#createDatabase ends its internal client
    // only on success — when CREATE DATABASE throws (e.g. 42P04 "already
    // exists" on the persistent data dir), that client leaks and stays
    // connected until the cluster shuts down, where it dies with 57P01 and
    // lands as an 'error' event during teardown (same race class as
    // terminateClientBackends below).
    const dbCreator = new Client({
      host: EMBEDDED_PG.host,
      port: EMBEDDED_PG.port,
      user: EMBEDDED_PG.user,
      password: EMBEDDED_PG.password,
      database: EMBEDDED_PG.adminDatabase,
      connectionTimeoutMillis: 5_000,
    });
    dbCreator.on("error", () => undefined);
    try {
      await dbCreator.connect();
      for (const db of [EMBEDDED_PG.devDatabase, EMBEDDED_PG.testDatabase]) {
        // No IF NOT EXISTS for CREATE DATABASE — tolerate 42P04 (already
        // exists from a previous run on the persistent data dir).
        await dbCreator
          .query(`CREATE DATABASE "${db.replace(/"/g, "")}"`)
          .catch(() => undefined);
      }
    } finally {
      await dbCreator.end().catch(() => undefined);
    }
    // Dev/test databases now exist — release port-waiters (see the constant's
    // docblock for the race this closes).
    fs.writeFileSync(DATABASES_READY_FILE, String(Date.now()));
    fs.writeFileSync(PID_FILE, String(process.pid));
    return { started: true, port: EMBEDDED_PG.port };
  } finally {
    fs.closeSync(fd);
    fs.rmSync(lockFile, { force: true });
  }
}

/**
 * Terminate every remaining client backend before the cluster shuts down.
 *
 * WHY: embedded-postgres `stop()` performs a FAST shutdown. If pooled or
 * pg-boss connections are still alive at that moment, Postgres kills them
 * with 57P01 "terminating connection" and, depending on socket-close timing,
 * clients can instead see a raw ECONNRESET — either way the error lands as an
 * unhandled `'error'` event AFTER all tests have passed, failing the run
 * (observed as intermittent `@form/database#test` failures under turbo).
 * Terminating backends explicitly, then waiting briefly, delivers a clean
 * protocol-level error while the cluster is still fully up, so pools already
 * end their sockets deterministically before `pg_ctl stop -m fast` runs.
 *
 * Safe to terminate cluster-wide: only the process that STARTED the cluster
 * ever calls this (reuse-aware `ensureEmbeddedPostgres` returns `started:
 * false` otherwise), and the root test pipeline runs packages serially.
 */
async function terminateClientBackends(): Promise<void> {
  const terminator = new Client({
    host: EMBEDDED_PG.host,
    port: EMBEDDED_PG.port,
    user: EMBEDDED_PG.user,
    password: EMBEDDED_PG.password,
    database: EMBEDDED_PG.adminDatabase,
    connectionTimeoutMillis: 2_000,
  });
  // The terminator must never crash the run itself: if the cluster is already
  // going away, connect/query failures say nothing about the stop outcome.
  terminator.on("error", () => undefined);
  try {
    await terminator.connect();
    // Covers form_test, form_dev AND the per-suite scratch databases
    // (t01_*, t05_outbox_queue, …) that hold pg-boss connections.
    await terminator.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname IS NOT NULL
        AND datname NOT IN ('template0', 'template1')
        AND backend_type = 'client backend'
        AND pid <> pg_backend_pid()
    `);
  } catch {
    // Best effort — fall through to the regular stop().
  } finally {
    await terminator.end().catch(() => undefined);
  }
}

export async function stopEmbeddedPostgres(): Promise<void> {
  if (handle) {
    // Teardown-race hardening: see terminateClientBackends — terminate
    // stragglers FIRST, give their clients ~50ms to observe the clean
    // 57P01 disconnect, and only then fast-shutdown the cluster.
    await terminateClientBackends();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await handle.stop();
    handle = null;
    fs.rmSync(PID_FILE, { force: true });
  }
}

/** PID of the process that booted the cluster, if recorded. */
export function embeddedPgOwnerPid(): number | null {
  try {
    const raw = fs.readFileSync(PID_FILE, "utf8").trim();
    const pid = Number(raw);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}
