import type { Pool, PoolClient, QueryResult } from "pg";

/**
 * Transaction wrapper (spec: "Tenancy and authorization", guardrails).
 *
 * Every tenant query runs inside a transaction that sets `app.workspace_id`
 * and `app.user_id` transaction-locally via `set_config(..., true)`. The
 * wrapper refuses tenant queries executed outside such a transaction, and a
 * missing setting yields NULL (no rows) inside Postgres rather than an
 * error that could be mistaken for an empty result.
 */

export interface TenantContext {
  workspaceId: string;
  userId?: string;
}

export class TransactionRequiredError extends Error {
  constructor(detail: string) {
    super(`tenant query refused: ${detail}`);
    this.name = "TransactionRequiredError";
  }
}

export interface TenantTx {
  /** Run a tenant query inside the guarded transaction. */
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
  /** The context this transaction was opened with. */
  readonly context: TenantContext;
}

interface TenantTxInternal extends TenantTx {
  /** Mark the transaction finished; further queries are refused. */
  finish(): void;
}

/**
 * Create a tenant transaction facade around a connected client. Exported
 * for tests and narrow seams; prefer {@link withTenantTx}, which opens the
 * transaction and sets the context for you. The first query verifies that
 * `app.workspace_id` is actually set transaction-locally and refuses the
 * query otherwise — so a facade created over a bare client outside a
 * transaction (or after it ended) cannot execute tenant SQL.
 */
export function createTenantTx(client: PoolClient, context: TenantContext): TenantTx {
  let verified = false;
  let finished = false;
  const tx: TenantTxInternal = {
    context,
    async query<R extends Record<string, unknown>>(sql: string, values?: unknown[]) {
      if (finished) {
        throw new TransactionRequiredError("the tenant transaction has already ended");
      }
      if (!verified) {
        const check = await client.query<{ workspace_id: string | null }>(
          "SELECT nullif(current_setting('app.workspace_id', true), '') AS workspace_id",
        );
        if (!check.rows[0]?.workspace_id) {
          throw new TransactionRequiredError(
            "no transaction-local app.workspace_id is set; run tenant queries through withTenantTx",
          );
        }
        verified = true;
      }
      return client.query<R>(sql, values);
    },
    finish(): void {
      finished = true;
      verified = false;
    },
  };
  return tx;
}

/**
 * Open a transaction, set `app.workspace_id` (and `app.user_id` when
 * present) transaction-locally, and run `fn`. On success the transaction
 * commits; on error it rolls back and the error propagates. The tenant
 * context never leaks: `set_config(..., true)` is scoped to the
 * transaction and disappears on COMMIT/ROLLBACK.
 */
export async function withTenantTx<T>(
  pool: Pool,
  context: TenantContext,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  const tx = createTenantTx(client, context) as TenantTxInternal;
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [context.workspaceId]);
    if (context.userId !== undefined) {
      await client.query("SELECT set_config('app.user_id', $1, true)", [context.userId]);
    }
    const result = await fn(tx);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    tx.finish();
    client.release();
  }
}

/**
 * Read the transaction-local tenant settings visible on a client. Used by
 * tests to prove the context is set inside transactions and empty after
 * they end (pooled-connection context-leak check).
 */
export async function readTenantSettings(
  queryFn: (sql: string, values?: unknown[]) => Promise<QueryResult<Record<string, unknown>>>,
): Promise<{ workspaceId: string | null; userId: string | null }> {
  const result = await queryFn(
    `SELECT nullif(current_setting('app.workspace_id', true), '') AS workspace_id,
            nullif(current_setting('app.user_id', true), '') AS user_id`,
  );
  const row = result.rows[0] ?? {};
  return {
    workspaceId: (row["workspace_id"] as string | null) ?? null,
    userId: (row["user_id"] as string | null) ?? null,
  };
}
