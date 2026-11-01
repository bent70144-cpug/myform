import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestPostgres, type TestPostgres } from "@myform/db";
import { PgBossJobQueue, type JobQueue } from "@myform/queue";
import type { WorkerEnv } from "@myform/config";
import { MyformWorker } from "../src/worker";

let testDb: TestPostgres;
let queue: JobQueue;

const env: WorkerEnv = {
  MYFORM_ENV: "test",
  LOG_LEVEL: "info",
  WORKER_DATABASE_URL: "", // set in beforeAll
  WORKER_HEARTBEAT_MS: 100,
};

const lines: Array<{ msg: string; [k: string]: unknown }> = [];
const logger = {
  debug: () => undefined,
  info: (msg: string, fields?: Record<string, unknown>) => lines.push({ msg, ...fields }),
  warn: () => undefined,
  error: () => undefined,
  child: () => logger,
};

beforeAll(async () => {
  testDb = await startTestPostgres();
  env.WORKER_DATABASE_URL = testDb.workerUrl;
  queue = new PgBossJobQueue({ connectionString: testDb.workerUrl });
});

afterAll(async () => {
  await testDb?.stop();
});

function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (condition()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error("timeout"));
      setTimeout(tick, 25);
    };
    tick();
  });
}

describe("MyformWorker", () => {
  it("processes outbox dispatch jobs and logs a heartbeat on its interval", async () => {
    const worker = new MyformWorker({ env, logger, queue });
    await worker.start();
    await queue.enqueue("outbox.dispatch", {});
    await waitFor(() => worker.dispatched > 0, 20_000);
    await waitFor(() => lines.filter((l) => l.msg === "worker heartbeat").length >= 3, 5_000);

    const heartbeats = lines.filter((l) => l.msg === "worker heartbeat");
    expect(heartbeats[0]?.everyMs).toBe(100);
    expect(lines.some((l) => l.msg === "outbox dispatch tick")).toBe(true);

    const ticksAtStop = worker.dispatched;
    await worker.stop();
    // Stopping is idempotent and leaves no timers behind.
    await worker.stop();
    expect(worker.dispatched).toBe(ticksAtStop);
  });
});
