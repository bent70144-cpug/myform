import type { PoolClient } from "pg";

export { runAdminBootstrap, ROLES, SCHEMAS, BootstrapError, type BootstrapPasswords } from "./bootstrap";
export {
  runMigrations,
  queryMigrations,
  SCHEMA_MIGRATIONS_TABLE,
  type MigrationReport,
  type RunMigrationsOptions,
} from "./migrator";
export {
  withTenantTx,
  createTenantTx,
  readTenantSettings,
  TransactionRequiredError,
  type TenantContext,
  type TenantTx,
} from "./transaction";
export {
  startTestPostgres,
  defaultMigrationsDir,
  urlFor,
  TEST_PASSWORDS,
  type TestPostgres,
  type StartTestPostgresOptions,
} from "./test-postgres";

export type { PoolClient };
