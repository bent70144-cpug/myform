import { Client } from "pg";

/**
 * One-time admin bootstrap (spec: "A one-time admin bootstrap, run with admin
 * credentials and not as a migration, creates the `app`, `auth`, and `pgboss`
 * schemas and the `migrator`, `app_user`, `worker_user`, and NOLOGIN
 * `fn_owner` roles").
 *
 * Guarantees:
 * - Roles are created with `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`;
 *   `fn_owner` is NOLOGIN. Nothing here grants BYPASSRLS.
 * - Role passwords come from environment variables (via the caller) and never
 *   appear in migration files.
 * - `GRANT fn_owner TO migrator WITH ADMIN OPTION` lets migrations `SET ROLE
 *   fn_owner` and assign function ownership (`ALTER FUNCTION ... OWNER TO
 *   fn_owner`) without superuser.
 * - Idempotent: safe to re-run; missing objects are created, existing ones are
 *   aligned (passwords refreshed, schema ownership corrected).
 * - Works on non-superuser admins (e.g. Neon's project owner): under PG-16+
 *   CREATEROLE semantics the admin holds ADMIN OPTION on roles it creates but
 *   no implicit membership, and `CREATE SCHEMA ... AUTHORIZATION` /
 *   `ALTER SCHEMA ... OWNER TO` need SET ROLE on the target owner. The admin
 *   therefore grants itself membership in the login roles first (no-op when
 *   already a member or when running as a true superuser).
 */

export interface BootstrapOptions {
  /** Superuser (admin) connection string targeting the application database. */
  adminUrl: string;
  migratorPassword: string;
  appUserPassword: string;
  workerPassword: string;
}

export interface BootstrapSummary {
  createdRoles: string[];
  alignedRoles: string[];
  schemas: string[];
  fnOwnerMembershipGranted: boolean;
  database: string;
}

interface RoleSpec {
  name: string;
  login: boolean;
  password?: string;
}

const ROLES: RoleSpec[] = [
  { name: "migrator", login: true },
  { name: "app_user", login: true },
  { name: "worker_user", login: true },
  { name: "fn_owner", login: false },
];

const SCHEMAS = ["app", "auth", "pgboss"] as const;

/** Identifiers are fixed constants, but quote defensively anyway. */
function ident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export async function bootstrapDatabase(
  options: BootstrapOptions,
): Promise<BootstrapSummary> {
  const admin = new Client({ connectionString: options.adminUrl });
  await admin.connect();
  const summary: BootstrapSummary = {
    createdRoles: [],
    alignedRoles: [],
    schemas: [],
    fnOwnerMembershipGranted: false,
    database: "",
  };

  try {
    const databaseRow = await admin.query<{ db: string }>(
      "SELECT current_database() AS db",
    );
    summary.database = databaseRow.rows[0]?.db ?? "";

    const passwords: Record<string, string | undefined> = {
      migrator: options.migratorPassword,
      app_user: options.appUserPassword,
      worker_user: options.workerPassword,
      fn_owner: undefined,
    };

    const existing = await admin.query<{
      rolname: string;
      rolcanlogin: boolean;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(
      "SELECT rolname, rolcanlogin, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = ANY($1::text[])",
      [ROLES.map((r) => r.name)],
    );
    const attrsByName = new Map(existing.rows.map((r) => [r.rolname, r]));

    for (const role of ROLES) {
      const current = attrsByName.get(role.name);
      if (!current) {
        const roleOptions =
          "NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS" +
          (role.login ? " LOGIN" : " NOLOGIN");
        const passwordClause = role.login
          ? ` PASSWORD ${literal(passwords[role.name] ?? "")}`
          : "";
        await admin.query(
          `CREATE ROLE ${ident(role.name)} WITH ${roleOptions}${passwordClause}`,
        );
        summary.createdRoles.push(role.name);
        continue;
      }
      // Alignment on an existing role may only touch properties the running
      // admin is allowed to change. Managed Postgres admins (e.g. Neon's
      // project owner) are CREATEROLE but not superuser, and PG 14+ rejects
      // `ALTER ROLE ... NOSUPERUSER`/`... NOBYPASSRLS` from non-superusers —
      // even when the role already has those attributes. Superuser-only
      // attributes cannot have drifted (only a superuser could have changed
      // them), so alignment covers LOGIN and the password.
      const clauses: string[] = [];
      if (current.rolcanlogin !== role.login) {
        clauses.push(role.login ? "LOGIN" : "NOLOGIN");
      }
      if (role.login) clauses.push(`PASSWORD ${literal(passwords[role.name] ?? "")}`);
      if (clauses.length > 0) {
        await admin.query(`ALTER ROLE ${ident(role.name)} WITH ${clauses.join(" ")}`);
      }
      // Existing roles are always reported as aligned, even when nothing had
      // to change (e.g. fn_owner on a persistent cluster).
      summary.alignedRoles.push(role.name);
    }

    // PG-16+: owning things as another role requires SET ROLE on it, and a
    // CREATEROLE (non-superuser) admin no longer inherits membership in the
    // roles it created. Grant the current admin user membership in each login
    // role so the schema statements below work on managed Postgres (Neon).
    for (const role of ROLES) {
      if (!role.login) continue;
      // INHERIT too: the follow-up auth-DDL step (ensure-auth-tables) creates
      // tables in the `auth` schema, which is OWNED BY `migrator` — a
      // non-inheriting membership would not carry that CREATE privilege.
      await admin.query(
        `GRANT ${ident(role.name)} TO current_user WITH INHERIT TRUE, SET TRUE`,
      );
    }

    for (const schema of SCHEMAS) {
      await admin.query(
        `CREATE SCHEMA IF NOT EXISTS ${ident(schema)} AUTHORIZATION ${ident("migrator")}`,
      );
      // Keep ownership aligned even if the schema pre-existed with another owner.
      await admin.query(
        `ALTER SCHEMA ${ident(schema)} OWNER TO ${ident("migrator")}`,
      );
      summary.schemas.push(schema);
    }

    const dbIdent = ident(summary.database);
    await admin.query(
      `GRANT CONNECT ON DATABASE ${dbIdent} TO ${ident("migrator")}, ${ident("app_user")}, ${ident("worker_user")}`,
    );

    const membership = await admin.query<{ granted: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_auth_members m
         JOIN pg_roles g ON g.oid = m.roleid
         JOIN pg_roles u ON u.oid = m.member
         WHERE g.rolname = 'fn_owner' AND u.rolname = 'migrator'
       ) AS granted`,
    );
    if (!membership.rows[0]?.granted) {
      // WITH ADMIN OPTION: migrator may SET ROLE fn_owner and grant it onward
      // — this is how migrations assign function ownership without superuser.
      await admin.query(
        `GRANT ${ident("fn_owner")} TO ${ident("migrator")} WITH ADMIN OPTION`,
      );
      summary.fnOwnerMembershipGranted = true;
    }

    return summary;
  } finally {
    await admin.end();
  }
}
