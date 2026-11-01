import type { Pool } from "pg";

/**
 * Session purge (ticket 10) — the worker's recurring cleanup call.
 *
 * `app.purge_expired_sessions()` (0006 migration) is SECURITY DEFINER, owned
 * by fn_owner, and granted ONLY to worker_user: it is the worker's single
 * cross-tenant cleanup path — it deletes every session expired for more than
 * seven days (`expires_at + interval '7 days' < now()`) and returns the
 * deleted-row count. Sessions inside the 7-day window (and the 5-minute
 * submission grace) are never touched.
 *
 * The helper takes a caller-owned pool (the worker passes its long-lived
 * worker_user pool over the DIRECT URL) instead of opening short-lived
 * connections per call. The SQL mirrors apps/api/src/public/purge.ts
 * (`purgeExpiredSessionsOnce`, the db-seam-tested shape) so both call sites
 * run the exact same statement.
 */
export async function purgeExpiredSessions(pool: Pool): Promise<number> {
  const result = await pool.query<{ result: number }>(
    `SELECT app.purge_expired_sessions() AS result`,
  );
  return result.rows[0]?.result ?? 0;
}
