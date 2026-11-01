/**
 * Installs the pg-boss schema DDL on behalf of the migrator.
 *
 * The pg-boss library runs at runtime with `migrate: false` (see the alpha
 * topology spike: pg-boss 12.38.0 skips its own migration and this
 * `getConstructionPlans("pgboss")` export carries the full install DDL).
 * The plans open and commit their own transaction, so this migration does
 * not wrap them in another one.
 *
 * After the DDL, the runtime role receives DML only — no DDL rights.
 */
const pgbossDmlGrants = `
GRANT USAGE ON SCHEMA pgboss TO worker_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO worker_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO worker_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO worker_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO worker_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT USAGE, SELECT ON SEQUENCES TO worker_user;
`;

module.exports = {
  async up(client) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getConstructionPlans } = require("pg-boss");
    const ddl = getConstructionPlans("pgboss");
    await client.query(ddl);
    await client.query(pgbossDmlGrants);
  },
};
