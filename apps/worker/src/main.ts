import { PgBossJobQueue } from "@myform/queue";
import { createLogger } from "@myform/logger";
import { readWorkerEnv } from "./env";
import { MyformWorker } from "./worker";

/**
 * Worker composition root. Connects as `worker_user` (direct URL — never
 * the pooled application URL), registers the outbox dispatch consumer, and
 * logs a heartbeat every WORKER_HEARTBEAT_MS.
 */
async function main(): Promise<void> {
  const env = readWorkerEnv();
  const logger = createLogger({ service: "worker", level: env.LOG_LEVEL });
  const queue = new PgBossJobQueue({ connectionString: env.WORKER_DATABASE_URL, logger });
  const worker = new MyformWorker({ env, logger, queue });

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    logger.info("worker shutting down", { signal });
    await worker.stop();
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await worker.start();
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `worker failed to start: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
