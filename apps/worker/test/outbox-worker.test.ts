import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { createPool, purgeExpiredSessions, uuidv7 } from "@form/database";
import {
  createScratchDatabase,
  dropDatabase,
  ensureBootstrapped,
  testRoleUrl,
  type BootstrappedUrls,
} from "@form/database/testing";
import {
  DEFAULT_DISPATCH_INTERVAL_MS,
  DEFAULT_SESSION_PURGE_INTERVAL_MS,
  OUTBOX_DISPATCH_JOB,
  SESSION_PURGE_JOB,
  heartbeatCron,
  installPgBossSchema,
  startWorker,
} from "../src/index";
import { FORM_CREATED_EVENT } from "../src/handlers/form-created";
import { grantPgBossRuntimeRole } from "@form/queue";

/**
 * Ticket 05 dispatcher slice — worker end-to-end against real Postgres:
 * the scheduled outbox-dispatch job claims `workspace.created` events
 * (inserted by app_user WITHOUT RETURNING) and the default handler logs the
 * structured event. Heartbeat stays wired through the same pg-boss instance
 * (ticket 02, covered in heartbeat.test.ts).
 *
 * Ticket 10 adds the third recurring schedule on the same mechanism:
 * `session.purge` runs the SECURITY-DEFINER app.purge_expired_sessions()
 * (granted ONLY to worker_user) through the worker pool.
 */

const SCRATCH_DB = "t05_worker_outbox";

let urls: BootstrappedUrls;
let adminClient: Client;
let appPool: ReturnType<typeof createPool>;

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

beforeAll(async () => {
  await createScratchDatabase(SCRATCH_DB);
  urls = await ensureBootstrapped(SCRATCH_DB);
  adminClient = new Client({ connectionString: urls.adminUrl });
  await adminClient.connect();

  // pgboss DDL as the migrator + DML-only runtime grants (worker_user) —
  // the same dev/test bootstrap path used by the queue package suites.
  await installPgBossSchema(testRoleUrl("migrator", SCRATCH_DB));
  await grantPgBossRuntimeRole(urls.adminUrl);

  appPool = createPool(urls.appUserUrl, { max: 2 });
}, 120_000);

afterAll(async () => {
  await adminClient?.end();
  await appPool?.end().catch(() => undefined);
  await dropDatabase(SCRATCH_DB);
});

async function insertWorkspaceCreated(payload: {
  workspaceId: string;
  userId: string;
}): Promise<string> {
  const id = uuidv7();
  // INSERT-only for app_user — no RETURNING (no SELECT grant).
  await appPool.query(
    `INSERT INTO app.outbox_events (id, event_type, payload)
     VALUES ($1, 'workspace.created', $2::jsonb)`,
    [id, JSON.stringify(payload)],
  );
  return id;
}

/** Ticket 06: the API inserts form.created with the same payload family. */
async function insertFormCreated(payload: {
  workspaceId: string;
  formId: string;
  userId: string;
}): Promise<string> {
  const id = uuidv7();
  await appPool.query(
    `INSERT INTO app.outbox_events (id, event_type, payload)
     VALUES ($1, $2, $3::jsonb)`,
    [id, FORM_CREATED_EVENT, JSON.stringify(payload)],
  );
  return id;
}

describe("worker: outbox dispatcher slice", () => {
  it("defaults the dispatch cadence to 30s (T02 Neon strategy)", () => {
    expect(DEFAULT_DISPATCH_INTERVAL_MS).toBe(30_000);
  });

  it("processes a workspace.created event end-to-end and logs the structured handler event", async () => {
    const id = await insertWorkspaceCreated({
      workspaceId: uuidv7(),
      userId: uuidv7(),
    });

    const logLines: Array<Record<string, unknown>> = [];
    const worker = await startWorker({
      databaseUrl: urls.workerUrl,
      heartbeatIntervalMs: 30_000, // not asserted here (heartbeat.test.ts)
      dispatchIntervalMs: 1_000, // fast cadence for the test window
      logger: {
        ...silentLogger,
        info: (line) => logLines.push(line),
      },
    });

    try {
      const deadline = Date.now() + 20_000;
      let processed = false;
      while (Date.now() < deadline && !processed) {
        const res = await adminClient.query<{ processed_at: string | null }>(
          "SELECT processed_at FROM app.outbox_events WHERE id = $1",
          [id],
        );
        processed = res.rows[0]?.processed_at != null;
        if (!processed) await new Promise((r) => setTimeout(r, 200));
      }
      expect(processed).toBe(true);

      const handlerLine = logLines.find(
        (line) => line["event"] === "outbox.workspace_created",
      );
      expect(handlerLine).toBeDefined();
      expect(handlerLine!["outboxEventId"]).toBe(id);
      expect(handlerLine!["workspaceId"]).toBeTypeOf("string");
    } finally {
      await worker.stop();
    }
  }, 30_000);

  it("processes a form.created event through the default handler (ticket 06)", async () => {
    const id = await insertFormCreated({
      workspaceId: uuidv7(),
      formId: uuidv7(),
      userId: uuidv7(),
    });

    const logLines: Array<Record<string, unknown>> = [];
    const worker = await startWorker({
      databaseUrl: urls.workerUrl,
      heartbeatIntervalMs: 30_000,
      dispatchIntervalMs: 1_000,
      logger: {
        ...silentLogger,
        info: (line) => logLines.push(line),
      },
    });

    try {
      // The 1s cron cadence is the production safety net, but pg-boss 12.38
      // throttles an ALREADY-REGISTERED schedule to one job per 60s slot —
      // this is the file's second worker start, so a bare wait races a slot
      // boundary. Drive ticks through the documented low-latency path
      // instead (ADR 0005): enqueue the dispatch job directly. The singleton
      // policy keeps overlapping ticks from stacking.
      const deadline = Date.now() + 20_000;
      let processed = false;
      while (Date.now() < deadline && !processed) {
        await worker.queue.enqueue(OUTBOX_DISPATCH_JOB, {});
        const res = await adminClient.query<{ processed_at: string | null }>(
          "SELECT processed_at FROM app.outbox_events WHERE id = $1",
          [id],
        );
        processed = res.rows[0]?.processed_at != null;
        if (!processed) await new Promise((r) => setTimeout(r, 500));
      }
      expect(processed).toBe(true);

      const handlerLine = logLines.find(
        (line) => line["event"] === "outbox.form_created",
      );
      expect(handlerLine).toBeDefined();
      expect(handlerLine!["outboxEventId"]).toBe(id);
      expect(handlerLine!["formId"]).toBeTypeOf("string");
      expect(handlerLine!["workspaceId"]).toBeTypeOf("string");
    } finally {
      await worker.stop();
    }
  }, 30_000);

  it("retriggered dispatch ticks process the event exactly once (no reprocess)", async () => {
    const id = await insertWorkspaceCreated({
      workspaceId: uuidv7(),
      userId: uuidv7(),
    });

    const handlerCalls: string[] = [];
    const worker = await startWorker({
      databaseUrl: urls.workerUrl,
      dispatchIntervalMs: 30_000, // schedule stays the slow safety net
      outboxHandlers: {
        "workspace.created": (event) => void handlerCalls.push(event.id),
      },
      logger: silentLogger,
    });

    try {
      // pg-boss 12.38 throttles cron schedules to one job per 60s slot, so a
      // fast deterministic test drives extra ticks through the documented
      // low-latency path: enqueueing the dispatch job directly (ADR 0005).
      // The singleton queue policy keeps overlapping ticks from stacking.
      await worker.queue.enqueue(OUTBOX_DISPATCH_JOB, {});
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline && handlerCalls.length === 0) {
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(handlerCalls).toEqual([id]);

      // A later tick must NOT rehandle the processed event.
      await worker.queue.enqueue(OUTBOX_DISPATCH_JOB, {});
      await new Promise((r) => setTimeout(r, 2_500));
      expect(handlerCalls).toEqual([id]);
    } finally {
      await worker.stop();
    }
  }, 25_000);

  it("defaults the session-purge cadence to hourly (ticket 10)", () => {
    expect(DEFAULT_SESSION_PURGE_INTERVAL_MS).toBe(3_600_000);
    // 3600s is not a divisor of 60 → the RRULE form (same mechanism as the
    // heartbeat/dispatch cadences, docs/adr/0003 + 0005).
    expect(heartbeatCron(DEFAULT_SESSION_PURGE_INTERVAL_MS)).toBe(
      "FREQ=SECONDLY;INTERVAL=3600",
    );
  });

  it("schedules session.purge and the handler runs the real purge helper (ticket 10)", async () => {
    const purgeCalls: number[] = [];
    const worker = await startWorker({
      databaseUrl: urls.workerUrl,
      heartbeatIntervalMs: 30_000, // not asserted here
      dispatchIntervalMs: 30_000, // not asserted here
      sessionPurgeIntervalMs: 1_000, // fast cadence for the test window
      sessionPurge: async (pool) => {
        // Seam wraps the REAL @form/database helper: the SECURITY DEFINER
        // function actually runs as worker_user (proves the grant too).
        const deleted = await purgeExpiredSessions(pool);
        purgeCalls.push(deleted);
        return deleted;
      },
      logger: silentLogger,
    });

    try {
      // First fire of a NEW schedule lands within ~interval + 10s
      // (cronMonitorIntervalSeconds: 5 — spike finding, see heartbeat.test.ts).
      const deadline = Date.now() + 20_000;
      while (purgeCalls.length === 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 200));
      }
      expect(purgeCalls.length).toBeGreaterThanOrEqual(1);
      expect(purgeCalls[0]).toBeTypeOf("number");
    } finally {
      await worker.stop();
    }
  }, 30_000);

  it("processes an enqueued session.purge job through the default handler and logs the purge event", async () => {
    const logLines: Array<Record<string, unknown>> = [];
    const worker = await startWorker({
      databaseUrl: urls.workerUrl,
      heartbeatIntervalMs: 30_000,
      dispatchIntervalMs: 30_000,
      logger: {
        ...silentLogger,
        info: (line) => logLines.push(line),
      },
    });

    try {
      // Low-latency path (ADR 0005): enqueue the job directly instead of
      // waiting on the hourly safety-net schedule.
      await worker.queue.enqueue(SESSION_PURGE_JOB, {});
      const deadline = Date.now() + 15_000;
      while (
        Date.now() < deadline &&
        !logLines.some((l) => l["event"] === "worker.session_purge")
      ) {
        await new Promise((r) => setTimeout(r, 200));
      }
      const line = logLines.find((l) => l["event"] === "worker.session_purge");
      expect(line).toBeDefined();
      expect(line!["deleted"]).toBeTypeOf("number");
    } finally {
      await worker.stop();
    }
  }, 25_000);
});
