import type { Client } from "pg";

/**
 * Minimal connection surface used by the bootstrap. Both `pg.Client` and
 * `pg.PoolClient` satisfy it.
 */
export type SqlClient = Pick<Client, "query">;

/**
 * Role names fixed by the spec ("Tenancy and authorization"). Runtime roles
 * never get BYPASSRLS; function ownership lives with the NOLOGIN fn_owner.
 */
export const ROLES = {
  migrator: "migrator",
  appUser: "app_user",
  workerUser: "worker_user",
  fnOwner: "fn_owner",
} as const;

export const SCHEMAS = ["app", "auth", "pgboss"] as const;

export interface BootstrapPasswords {
  migrator: string;
  appUser: string;
  workerUser: string;
}

export class BootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BootstrapError";
  }
}

/** SQL string literals must be escaped by doubling single quotes. */
export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** SQL identifiers must be quoted with doubled double quotes. */
export function sqlIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function roleExists(client: SqlClient, name: string): Promise<boolean> {
  const result = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [name]);
  return result.rows.length > 0;
}

async function ensureLoginRole(
  client: PoolClient,
  name: string,
  password: string,
): Promise<void> {
  if (await roleExists(client, name)) {
    // One-time bootstrap is re-runnable: refresh the password from env and
    // re-assert the safety attributes. Passwords never land in migrations.
    await client.query(
      `ALTER ROLE ${name} LOGIN PASSWORD ${sqlLiteral(password)} NOBYPASSRLS NOINHERIT`,
    );
    return;
  }
  await client.query(
    `CREATE ROLE ${name} LOGIN PASSWORD ${sqlLiteral(password)} NOBYPASSRLS NOINHERIT`,
  );
}

/**
 * One-time admin bootstrap (spec: "Tenancy and authorization"). Runs with
 * admin credentials — never as a migration. Creates the `app`, `auth`, and
 * `pgboss` schemas owned by `migrator`, the `migrator`/`app_user`/
 * `worker_user` roles, and the NOLOGIN `fn_owner`. Grants `fn_owner` to
 * `migrator` WITH SET so migrations can assign function ownership. No
 * runtime role has or can get BYPASSRLS here.
 */
export async function runAdminBootstrap(
  admin: SqlClient,
  passwords: BootstrapPasswords,
): Promise<void> {
  if (!passwords.migrator || !passwords.appUser || !passwords.workerUser) {
    throw new BootstrapError("bootstrap requires non-empty passwords for migrator, app_user, and worker_user");
  }

  await ensureLoginRole(admin, ROLES.migrator, passwords.migrator);
  await ensureLoginRole(admin, ROLES.appUser, passwords.appUser);
  await ensureLoginRole(admin, ROLES.workerUser, passwords.workerUser);

  const fnOwnerExists = await roleExists(admin, ROLES.fnOwner);
  if (!fnOwnerExists) {
    await admin.query(`CREATE ROLE ${ROLES.fnOwner} NOLOGIN NOBYPASSRLS NOINHERIT`);
  } else {
    await admin.query(`ALTER ROLE ${ROLES.fnOwner} NOLOGIN NOBYPASSRLS`);
  }

  // Schemas owned by migrator; runtime roles get no implicit access.
  for (const schema of SCHEMAS) {
    await admin.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await admin.query(`ALTER SCHEMA ${schema} OWNER TO ${ROLES.migrator}`);
    await admin.query(`REVOKE ALL ON SCHEMA ${schema} FROM PUBLIC`);
  }

  // The migrator needs database-level CREATE for `CREATE SCHEMA IF NOT
  // EXISTS` (Postgres checks the privilege even when the schema exists).
  await admin.query(
    `GRANT CREATE ON DATABASE ${sqlIdent((await admin.query<{ db: string }>("SELECT current_database() AS db")).rows[0]?.db ?? "")} TO ${ROLES.migrator}`,
  );

  // Migrations assign function ownership via SET ROLE fn_owner.
  await admin.query(
    `GRANT ${ROLES.fnOwner} TO ${ROLES.migrator} WITH SET TRUE, INHERIT FALSE`,
  );

  // Runtime roles may resolve objects in these schemas (tables get their
  // own grants from migrations); nothing else is granted here.
  await admin.query(`GRANT USAGE ON SCHEMA app TO ${ROLES.appUser}, ${ROLES.workerUser}`);
  await admin.query(`GRANT USAGE ON SCHEMA pgboss TO ${ROLES.workerUser}`);
}
