import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client, type QueryResult } from "pg";

/**
 * Migrator (spec: "Tenancy and authorization", "Queue, outbox, and audit").
 * Runs as the `migrator` role after the admin bootstrap. Creates tables,
 * RLS policies, functions, and grants. The pg-boss schema DDL is installed
 * here via pg-boss's `getConstructionPlans("pgboss")` — the pg-boss library
 * itself runs with `migrate: false` so it never touches DDL at runtime.
 */

export const SCHEMA_MIGRATIONS_TABLE = "app.schema_migrations";
const MIGRATION_LOCK_KEY = "myform:schema-migrations";

export interface AppliedMigration {
  name: string;
}

export interface MigrationReport {
  applied: string[];
  skipped: string[];
}

export interface Migration {
  name: string;
  kind: "sql" | "module";
  /** For sql migrations: statements split on the breakpoint markers. */
  statements?: string[];
  /** For module migrations: manages its own transaction. */
  up?: (client: Client) => Promise<void>;
}

export interface RunMigrationsOptions {
  /** Connection string for the `migrator` role. */
  uri: string;
  /** Directory containing `*.sql` and `*.migrate.cjs` files. */
  migrationsDir: string;
  onLog?: (message: string) => void;
}

function loadMigrations(dir: string): Migration[] {
  const entries = readdirSync(dir).filter((f) => f.endsWith(".sql") || f.endsWith(".migrate.cjs"));
  entries.sort();
  return entries.map((fileName) => {
    const name = fileName.replace(/\.(sql|migrate\.cjs)$/, "");
    const fullPath = join(dir, fileName);
    if (fileName.endsWith(".migrate.cjs")) {
      // Module migrations are plain CJS so they can require pg-boss.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(fullPath) as { up: (client: Client) => Promise<void> };
      if (typeof mod.up !== "function") {
        throw new Error(`migration ${fileName} must export an async up(client) function`);
      }
      return { name, kind: "module" as const, up: mod.up };
    }
    const source = readFileSync(fullPath, "utf8");
    const statements = source
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return { name, kind: "sql" as const, statements };
  });
}

async function applySqlMigration(client: Client, migration: Migration): Promise<void> {
  await client.query("BEGIN");
  try {
    for (const statement of migration.statements ?? []) {
      await client.query(statement);
    }
    await client.query(`INSERT INTO ${SCHEMA_MIGRATIONS_TABLE} (name) VALUES ($1)`, [migration.name]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function applyModuleMigration(client: Client, migration: Migration): Promise<void> {
  // Module migrations manage their own transaction (the pg-boss
  // construction plans open and commit one themselves).
  await migration.up?.(client);
  await client.query(`INSERT INTO ${SCHEMA_MIGRATIONS_TABLE} (name) VALUES ($1)`, [migration.name]);
}

/**
 * Apply pending migrations in filename order under a session advisory lock
 * so concurrent migrators serialize. Applied migrations are recorded in
 * `app.schema_migrations` and never re-run.
 */
export async function runMigrations(options: RunMigrationsOptions): Promise<MigrationReport> {
  const log = options.onLog ?? (() => undefined);
  const client = new Client({ connectionString: options.uri });
  await client.connect();
  const applied: string[] = [];
  const skipped: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [MIGRATION_LOCK_KEY]);
    await client.query(`CREATE TABLE IF NOT EXISTS ${SCHEMA_MIGRATIONS_TABLE} (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

    const already = await client.query<AppliedMigration>(
      `SELECT name FROM ${SCHEMA_MIGRATIONS_TABLE} ORDER BY name`,
    );
    const appliedNames = new Set(already.rows.map((r) => r.name));
    const migrations = loadMigrations(options.migrationsDir);

    for (const migration of migrations) {
      if (appliedNames.has(migration.name)) {
        skipped.push(migration.name);
        continue;
      }
      try {
        if (migration.kind === "sql") {
          await applySqlMigration(client, migration);
        } else {
          await applyModuleMigration(client, migration);
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`migration ${migration.name} failed: ${detail}`, { cause: error });
      }
      applied.push(migration.name);
      log(`applied migration ${migration.name}`);
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
  return { applied, skipped };
}

/** Convenience wrapper used by tests and the CLI. */
export async function queryMigrations(client: Client): Promise<QueryResult<AppliedMigration>> {
  return client.query<AppliedMigration>(`SELECT name FROM ${SCHEMA_MIGRATIONS_TABLE} ORDER BY name`);
}
