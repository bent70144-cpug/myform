import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { runAdminBootstrap, type BootstrapPasswords } from "./bootstrap";
import { runMigrations } from "./migrator";

/**
 * Test seam (spec: "Testing Decisions" — database seam). Boots a temporary
 * embedded Postgres (the documented Docker substitute, see
 * `notes/local-env.md`), runs the admin bootstrap and the migrations as the
 * right roles, and hands out per-role URLs. Every database test uses this
 * consistently — no test ever connects with a superuser except through the
 * bootstrap itself.
 */

export const TEST_PASSWORDS: BootstrapPasswords = {
  migrator: "migrator_password",
  appUser: "app_user_password",
  workerUser: "worker_user_password",
};

const TEST_SUPERUSER_PASSWORD = "postgres";

export interface TestPostgres {
  /** Admin (bootstrap) connection URL — superuser, for the bootstrap only. */
  adminUrl: string;
  migratorUrl: string;
  appUrl: string;
  workerUrl: string;
  port: number;
  databaseName: string;
  /** Runs the admin bootstrap + migrations (idempotent; done once at start). */
  stop(): Promise<void>;
}

export interface StartTestPostgresOptions {
  databaseName?: string;
  /** Skip migrations (rare; bootstrap-only tests). */
  skipMigrations?: boolean;
}

function findFreePort(): number {
  // Random high port with a collision-retry built into the caller loop.
  return 30000 + Math.floor(Math.random() * 20000);
}

export async function startTestPostgres(
  options: StartTestPostgresOptions = {},
): Promise<TestPostgres> {
  const databaseName = options.databaseName ?? "myform";
  const dataDir = mkdtempSync(join(tmpdir(), "myform-test-pg-"));
  let lastError: unknown = new Error("unreachable");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const port = findFreePort();
    const pg = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: "postgres",
      password: TEST_SUPERUSER_PASSWORD,
      port,
      persistent: false,
      authMethod: "password",
      // Recreate missing binaries' symlinks at runtime when the package's
      // install script was skipped (pnpm blocks build scripts by default).
      autoRehydrateSymlinks: true,
    });
    try {
      await pg.initialise();
      await pg.start();
      await pg.createDatabase(databaseName);
      await bootstrapAndMigrate(port, databaseName, options);
      return {
        adminUrl: urlFor("postgres", TEST_SUPERUSER_PASSWORD, port, databaseName),
        migratorUrl: urlFor("migrator", TEST_PASSWORDS.migrator, port, databaseName),
        appUrl: urlFor("app_user", TEST_PASSWORDS.appUser, port, databaseName),
        workerUrl: urlFor("worker_user", TEST_PASSWORDS.workerUser, port, databaseName),
        port,
        databaseName,
        stop: async () => {
          try {
            // Terminate any client still connected (e.g. a leaked pg-boss
            // pool) BEFORE the fast shutdown, so postgres never has to send
            // 57P01 "terminating connection" errors to live sockets — those
            // land as unhandled 'error' events and fail the test run even
            // when every test passed.
            const admin = new Client({ connectionString: urlFor("postgres", TEST_SUPERUSER_PASSWORD, port, databaseName) });
            try {
              await admin.connect();
              await admin.query(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
                [databaseName],
              );
            } catch {
              // best-effort: if this fails, the shutdown below still runs
            } finally {
              await admin.end().catch(() => undefined);
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
            await pg.stop();
          } finally {
            rmSync(dataDir, { recursive: true, force: true });
          }
        },
      };
    } catch (error) {
      lastError = error;
      await pg.stop().catch(() => undefined);
    }
  }
  rmSync(dataDir, { recursive: true, force: true });
  throw new Error(`failed to start embedded postgres after 3 attempts: ${String(lastError)}`);
}

async function bootstrapAndMigrate(
  port: number,
  databaseName: string,
  options: StartTestPostgresOptions,
): Promise<void> {
  const adminUrl = urlFor("postgres", TEST_SUPERUSER_PASSWORD, port, databaseName);
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await runAdminBootstrap(bootstrap, TEST_PASSWORDS);
  } finally {
    await bootstrap.end();
  }
  if (!options.skipMigrations) {
    await runMigrations({ uri: urlFor("migrator", TEST_PASSWORDS.migrator, port, databaseName), migrationsDir: defaultMigrationsDir() });
  }
}

/** Resolve the migrations directory relative to this module's location. */
export function defaultMigrationsDir(): string {
  // src/test-postgres.ts → ../migrations; dist/test-postgres.js → ../migrations
  return join(__dirname, "..", "migrations");
}

export function urlFor(user: string, password: string, port: number, database: string): string {
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`;
}
