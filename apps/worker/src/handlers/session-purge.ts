import { purgeExpiredSessions } from "@form/database";

/**
 * Handler for the recurring `session.purge` job (ticket 10, spec: "The worker
 * deletes sessions expired for more than seven days through
 * purge_expired_sessions()").
 *
 * The call goes through the @form/database helper (same SQL as the API-side
 * `purgeExpiredSessionsOnce` seam): `app.purge_expired_sessions()` is
 * SECURITY DEFINER and granted ONLY to worker_user — the worker's single
 * cross-tenant cleanup path. The worker's pool is the DIRECT-URL worker_user
 * pool, so the function is executable; nothing else in the worker touches
 * form_sessions.
 *
 * Error semantics: the handler never swallows failures — a rejected run is
 * logged (structured, redacted by the shared logger factory) and rethrown so
 * the queue adapter marks the job failed and retries it; the next hourly
 * sweep is the backstop (expired-for-7-days rows only ever age, never expire
 * out of reach).
 */
export const SESSION_PURGE_JOB = "session.purge";

export interface SessionPurgeHandlerOptions {
  /** The worker's pooled worker_user connection (DIRECT URL). */
  pool: Parameters<typeof purgeExpiredSessions>[0];
  logger: {
    info(line: Record<string, unknown>, message?: string): void;
    error(line: Record<string, unknown>, message?: string): void;
  };
  /** Test seam: override the DB call (defaults to the @form/database helper). */
  purge?: (pool: Parameters<typeof purgeExpiredSessions>[0]) => Promise<number>;
}

export function createSessionPurgeHandler(
  options: SessionPurgeHandlerOptions,
): () => Promise<void> {
  const purge = options.purge ?? purgeExpiredSessions;
  return async () => {
    try {
      const deleted = await purge(options.pool);
      options.logger.info(
        { event: "worker.session_purge", deleted },
        "session purge ran",
      );
    } catch (error) {
      options.logger.error(
        { event: "worker.session_purge_error", message: String(error) },
        "session purge failed",
      );
      throw error;
    }
  };
}
