/**
 * Dev/e2e companion step: installs Better Auth's compiled DDL for the `auth`
 * schema and the app_user DML grants — the same thing the api test fixture
 * does (apps/api/test/app-fixture.ts, "test-time equivalent of the production
 * migrator step"). Production still owns this as a migrator step; see the
 * ticket-12 runbook pending-user checklist.
 *
 * Env:
 *   ADMIN_DATABASE_URL  — superuser/admin connection (creates schema + tables)
 *   APP_DATABASE_URL    — app_user connection (only to verify access at the end)
 *
 * Idempotent: Better Auth's migrations table tracks applied statements.
 */
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { getMigrations } from "better-auth/db/migration";

const AUTH_SCHEMA = "auth";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    process.stderr.write(`[auth-schema] missing required env ${name}\n`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const adminUrl = requireEnv("ADMIN_DATABASE_URL");
  const appUrl = requireEnv("APP_DATABASE_URL");

  const ddlPool = new Pool({ connectionString: adminUrl, max: 1 });
  const kysely = new Kysely({ dialect: new PostgresDialect({ pool: ddlPool }) });
  try {
    const { runMigrations } = await getMigrations(
      {
        database: { db: kysely, type: "postgres", schemaName: AUTH_SCHEMA },
        plugins: [],
        rateLimit: { enabled: false },
      } as never,
      { throwOnUnsafe: false },
    );
    await runMigrations();
  } finally {
    await kysely.destroy();
  }

  // Runtime DML grants for app_user (no CREATE — asserted elsewhere).
  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  try {
    for (const sql of [
      `GRANT USAGE ON SCHEMA ${AUTH_SCHEMA} TO app_user`,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${AUTH_SCHEMA} TO app_user`,
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${AUTH_SCHEMA} TO app_user`,
    ]) {
      await admin.query(sql);
    }
  } finally {
    await admin.end();
  }

  // Fail loudly if app_user still cannot read the user table.
  const probe = new Pool({ connectionString: appUrl, max: 1 });
  try {
    await probe.query(`SELECT 1 FROM ${AUTH_SCHEMA}.user LIMIT 1`);
  } finally {
    await probe.end();
  }

  process.stdout.write("[auth-schema] auth schema DDL + app_user grants verified\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`[auth-schema] failed: ${String(error)}\n`);
  process.exit(1);
});
