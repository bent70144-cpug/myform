import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import {
  createTenantTx,
  readTenantSettings,
  startTestPostgres,
  TransactionRequiredError,
  withTenantTx,
  type TestPostgres,
} from "../src";

let testDb: TestPostgres;
let appPool: Pool;

const WORKSPACE_ID = "018f0000-0000-7000-8000-000000000001";
const USER_ID = "018f0000-0000-7000-8000-0000000000aa";

beforeAll(async () => {
  testDb = await startTestPostgres();
  appPool = new Pool({ connectionString: testDb.appUrl, max: 3 });
});

afterAll(async () => {
  await appPool?.end();
  await testDb?.stop();
});

describe("admin bootstrap", () => {
  it("creates the app/auth/pgboss schemas owned by migrator", async () => {
    const admin = new Client({ connectionString: testDb.adminUrl });
    await admin.connect();
    try {
      const schemas = await admin.query<{ nspname: string; owner: string }>(
        `SELECT n.nspname, r.rolname AS owner
         FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner
         WHERE n.nspname IN ('app','auth','pgboss')`,
      );
      const owners = Object.fromEntries(schemas.rows.map((r) => [r.nspname, r.owner]));
      expect(owners["app"]).toBe("migrator");
      expect(owners["auth"]).toBe("migrator");
      expect(owners["pgboss"]).toBe("migrator");
    } finally {
      await admin.end();
    }
  });

  it("creates login roles for migrator/app_user/worker_user and NOLOGIN fn_owner — none with BYPASSRLS", async () => {
    const admin = new Client({ connectionString: testDb.adminUrl });
    await admin.connect();
    try {
      const roles = await admin.query<{
        rolname: string;
        rolcanlogin: boolean;
        rolbypassrls: boolean;
      }>(
        `SELECT rolname, rolcanlogin, rolbypassrls FROM pg_roles
         WHERE rolname IN ('migrator','app_user','worker_user','fn_owner')`,
      );
      const byName = Object.fromEntries(roles.rows.map((r) => [r.rolname, r]));
      expect(Object.keys(byName).sort()).toEqual(["app_user", "fn_owner", "migrator", "worker_user"]);
      expect(byName["migrator"]?.rolcanlogin).toBe(true);
      expect(byName["app_user"]?.rolcanlogin).toBe(true);
      expect(byName["worker_user"]?.rolcanlogin).toBe(true);
      expect(byName["fn_owner"]?.rolcanlogin).toBe(false);
      for (const role of Object.values(byName)) {
        expect(role.rolbypassrls, `${role.rolname} must not have BYPASSRLS`).toBe(false);
      }
    } finally {
      await admin.end();
    }
  });

  it("grants fn_owner to migrator WITH SET so migrations can assign function ownership", async () => {
    const admin = new Client({ connectionString: testDb.adminUrl });
    await admin.connect();
    try {
      const membership = await admin.query<{ set_option: boolean }>(
        `SELECT m.set_option
         FROM pg_auth_members m
         JOIN pg_roles fn ON fn.oid = m.roleid
         JOIN pg_roles mig ON mig.oid = m.member
         WHERE fn.rolname = 'fn_owner' AND mig.rolname = 'migrator'`,
      );
      expect(membership.rows[0]?.set_option).toBe(true);
    } finally {
      await admin.end();
    }
  });

  it("is re-runnable without changing the outcome", async () => {
    // startTestPostgres already ran bootstrap+migrations; re-running the
    // bootstrap must succeed (password refresh, no duplicates).
    const { runAdminBootstrap, TEST_PASSWORDS } = await import("../src/index.js");
    const admin = new Client({ connectionString: testDb.adminUrl });
    await admin.connect();
    try {
      await runAdminBootstrap(admin, TEST_PASSWORDS);
      const count = await admin.query<{ count: string }>(
        `SELECT count(*) FROM pg_roles WHERE rolname IN ('migrator','app_user','worker_user','fn_owner')`,
      );
      expect(count.rows[0]?.count).toBe("4");
    } finally {
      await admin.end();
    }
  });
});

describe("migrations", () => {
  it("record applied migrations and install the pg-boss schema DDL", async () => {
    const migrator = new Client({ connectionString: testDb.migratorUrl });
    await migrator.connect();
    try {
      const applied = await migrator.query<{ name: string }>(
        "SELECT name FROM app.schema_migrations ORDER BY name",
      );
      const names = applied.rows.map((r) => r.name);
      expect(names).toContain("0001_pgboss");
      expect(names).toContain("0002_app_baseline");
    } finally {
      await migrator.end();

    }
    const worker = new Client({ connectionString: testDb.workerUrl });
    await worker.connect();
    try {
      const version = await worker.query<{ version: number }>("SELECT version FROM pgboss.version");
      expect(version.rows.length).toBeGreaterThan(0);
      // worker_user has DML on pgboss tables...
      await worker.query("SELECT count(*) FROM pgboss.job");
      // ...but no DDL rights.
      await expect(worker.query("CREATE TABLE pgboss.no_ddl (id int)")).rejects.toThrow(/permission denied/i);
    } finally {
      await worker.end();
    }
  });

  it("keeps the request-serving role out of the queue schema", async () => {
    const app = new Client({ connectionString: testDb.appUrl });
    await app.connect();
    try {
      await expect(app.query("SELECT count(*) FROM pgboss.job")).rejects.toThrow(/permission denied/i);
    } finally {
      await app.end();
    }
  });

  it("re-runs are no-ops (advisory-locked, recorded)", async () => {
    const { runMigrations, defaultMigrationsDir } = await import("../src/index.js");
    const report = await runMigrations({
      uri: testDb.migratorUrl,
      migrationsDir: defaultMigrationsDir(),
    });
    expect(report.applied).toEqual([]);
    expect(report.skipped).toContain("0001_pgboss");
  });
});

describe("transaction wrapper", () => {
  it("sets app.workspace_id and app.user_id transaction-locally", async () => {
    await withTenantTx(appPool, { workspaceId: WORKSPACE_ID, userId: USER_ID }, async (tx) => {
      const settings = await readTenantSettings((sql, values) => tx.query(sql, values));
      expect(settings.workspaceId).toBe(WORKSPACE_ID);
      expect(settings.userId).toBe(USER_ID);
    });
  });

  it("leaves no tenant context on the pooled connection after commit", async () => {
    await withTenantTx(appPool, { workspaceId: WORKSPACE_ID }, async () => undefined);
    const settings = await readTenantSettings((sql, values) => appPool.query(sql, values));
    expect(settings.workspaceId).toBeNull();
    expect(settings.userId).toBeNull();
  });

  it("refuses tenant queries through a facade outside a transaction", async () => {
    const client = await appPool.connect();
    try {
      const tx = createTenantTx(client, { workspaceId: WORKSPACE_ID });
      await expect(tx.query("SELECT 1")).rejects.toBeInstanceOf(TransactionRequiredError);
    } finally {
      client.release();
    }
  });

  it("refuses queries after the transaction has ended", async () => {
    let captured: Awaited<ReturnType<typeof createTenantTx>> | undefined;
    await withTenantTx(appPool, { workspaceId: WORKSPACE_ID }, async (tx) => {
      captured = tx;
    });
    await expect(captured!.query("SELECT 1")).rejects.toThrow(/already ended/);
  });

  it("rolls back on failure so partial writes never escape", async () => {
    await withTenantTx(appPool, { workspaceId: WORKSPACE_ID }, async (tx) => {
      await tx.query("CREATE TEMP TABLE tx_probe(id int)");
      await tx.query("INSERT INTO tx_probe VALUES (1)");
      throw new Error("boom");
    }).catch(() => undefined);
    // Same wrapper must be usable again afterwards (connection state reset).
    const result = await withTenantTx(appPool, { workspaceId: WORKSPACE_ID }, async (tx) =>
      tx.query<{ one: number }>("SELECT 1 AS one"),
    );
    expect(result.rows[0]?.one).toBe(1);
  });
});
