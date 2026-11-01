import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { runAdminBootstrap } from "./bootstrap";
import { runMigrations } from "./migrator";
import { defaultMigrationsDir } from "./test-postgres";

/**
 * CLI for the one-time admin bootstrap and the migrator. Environment-driven
 * (see `.env.example`):
 *
 *   bootstrap → ADMIN_DATABASE_URL + MIGRATOR_PASSWORD/APP_USER_PASSWORD/
 *               WORKER_USER_PASSWORD
 *   migrate   → MIGRATOR_DATABASE_URL
 *
 * For local development the CLI also reads the nearest `.env` (walking up
 * from the cwd, e.g. the repo root `.env` documented in `.env.example`).
 * Real environment variables always win over `.env` values.
 */

/** Load the nearest .env into process.env without overriding real values. */
function loadDotEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 4; i += 1) {
    const file = join(dir, ".env");
    if (existsSync(file)) {
      for (const raw of readFileSync(file, "utf8").split("\n")) {
        const line = raw.trim();
        if (line.length === 0 || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq <= 0) continue;
        const key = line.slice(0, eq).trim();
        const value = line.slice(eq + 1).trim();
        if (process.env[key] === undefined) process.env[key] = value;
      }
      return;
    }
    const parent = join(dir, "..");
    if (parent === dir) return;
    dir = parent;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`missing required environment variable ${name}`);
  }
  return value;
}

async function main(): Promise<number> {
  loadDotEnv();
  const command = process.argv[2];
  if (command === "bootstrap") {
    const admin = new Client({ connectionString: requireEnv("ADMIN_DATABASE_URL") });
    await admin.connect();
    try {
      await runAdminBootstrap(admin, {
        migrator: requireEnv("MIGRATOR_PASSWORD"),
        appUser: requireEnv("APP_USER_PASSWORD"),
        workerUser: requireEnv("WORKER_USER_PASSWORD"),
      });
    } finally {
      await admin.end();
    }
    process.stdout.write("admin bootstrap complete\n");
    return 0;
  }
  if (command === "migrate") {
    const report = await runMigrations({
      uri: requireEnv("MIGRATOR_DATABASE_URL"),
      migrationsDir: defaultMigrationsDir(),
      onLog: (message) => process.stdout.write(`${message}\n`),
    });
    process.stdout.write(
      `migrations complete: ${report.applied.length} applied, ${report.skipped.length} skipped\n`,
    );
    return 0;
  }
  process.stderr.write("usage: node cli.js <bootstrap|migrate>\n");
  return 2;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
