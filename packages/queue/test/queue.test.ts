import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { startTestPostgres, type TestPostgres } from "@myform/db";
import { createLogger, type Logger } from "@myform/logger";
import { OUTBOX_DISPATCH_JOB, PgBossJobQueue, type JobQueue } from "../src";

let testDb: TestPostgres;
let workerPool: Pool;
let queue: JobQueue;
const logs: Array<{ msg: string; fields?: Record<string, unknown> }> = [];
const logger: Logger = createLogger({
  service: "queue-test",
  level: "error",
  sink: (line) => logs.push(JSON.parse(line) as { msg: string }),
});

function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      void Promise.resolve()
        .then(condition)
        .then((ok) => {
          if (ok) return resolve();
          if (Date.now() - started > timeoutMs) {
            throw new Error("timed out waiting for condition");
          }
          setTimeout(tick, 50);
        })
        .catch(reject);
    };
    tick();
  });
}

beforeAll(async () => {
  // startTestPostgres runs the admin bootstrap + migrations as the right
  // roles, including the migrator-installed pg-boss DDL — the exact
  // production posture the adapter must run under.
  testDb = await startTestPostgres();
  workerPool = new Pool({ connectionString: testDb.workerUrl, max: 2 });
  queue = new PgBossJobQueue({
    connectionString: testDb.workerUrl,
    logger: logger.child({ component: "queue" }),
  });
  await queue.start();
});

afterAll(async () => {
  await queue?.stop();
  await workerPool?.end();
  await testDb?.stop();
});

describe("pg-boss adapter (JobQueue port)", () => {
  it("processes an enqueued job through a registered worker", async () => {
    const processed: Array<{ id: string; data: unknown }> = [];
    await queue.work("test.ping", async (job) => {
      processed.push({ id: job.id, data: job.data });
    });
    const jobId = await queue.enqueue("test.ping", { n: 1 });
    expect(jobId).toBeTruthy();
    await waitFor(() => processed.length > 0, 20_000);
    expect(processed[0]?.data).toEqual({ n: 1 });
  });

  it("dead-letters a failing job after its retry limit", async () => {
    await queue.work("test.fail", async () => {
      throw new Error("always fails");
    });
    await queue.enqueue("test.fail", {}, { retryLimit: 1, retryDelaySeconds: 1 });
    await waitFor(async () => {
      const dead = await workerPool.query(
        "SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'test.fail' AND state = 'failed'",
      );
      return (dead.rows[0]?.n ?? 0) > 0;
    }, 30_000).catch(() => undefined);
    const dead = await workerPool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'test.fail' AND state = 'failed'",
    );
    expect(dead.rows[0]?.n).toBeGreaterThan(0);
  }, 60_000);

  it("registers a recurring schedule (outbox dispatch heartbeat)", async () => {
    await queue.schedule(OUTBOX_DISPATCH_JOB, "*/5 * * * *");
    const rows = await workerPool.query<{ name: string }>(
      "SELECT name FROM pgboss.schedule WHERE name = $1",
      [OUTBOX_DISPATCH_JOB],
    );
    expect(rows.rows.map((r) => r.name)).toContain(OUTBOX_DISPATCH_JOB);
  });

  it("runs with migrate:false against the migrator-installed schema as worker_user", async () => {
    // The queue already started successfully in beforeAll — with
    // migrate:false/createSchema:false, that is only possible when the DDL
    // was fully installed by the migrator. Assert the version table agrees.
    const version = await workerPool.query<{ version: number }>(
      "SELECT version FROM pgboss.version",
    );
    expect(version.rows[0]?.version).toBeGreaterThan(0);
    // And the request-serving role cannot even look at the queue schema.
    const app = new Pool({ connectionString: testDb.appUrl, max: 1 });
    try {
      await expect(app.query("SELECT count(*) FROM pgboss.job")).rejects.toThrow(
        /permission denied/i,
      );
    } finally {
      await app.end();
    }
  });

  it("enqueues a delayed job that is not immediately available", async () => {
    const id = await queue.enqueue("test.delayed", {}, { delaySeconds: 60 });
    expect(id).toBeTruthy();
    const rows = await workerPool.query<{ start_after: Date; state: string }>(
      "SELECT start_after, state FROM pgboss.job WHERE id = $1",
      [id],
    );
    const job = rows.rows[0];
    expect(job?.state).toBe("created");
    expect(job && new Date(job.start_after).getTime()).toBeGreaterThan(Date.now() + 30_000);
  });
});
