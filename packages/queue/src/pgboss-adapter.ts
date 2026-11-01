import type { Logger } from "@myform/logger";
import { PgBoss } from "pg-boss";
import type { EnqueueOptions, JobHandler, JobQueue, RegisterWorkerOptions } from "./port";

/**
 * pg-boss adapter for the JobQueue port (spec: "Queue, outbox, and audit").
 *
 * - Connects directly to Postgres (never through the pooled application
 *   connection): transaction-mode pooling breaks session-scoped features
 *   such as advisory locks.
 * - Runs with `migrate: false` and `createSchema: false`: the `pgboss` DDL
 *   is installed by the migrator (packages/db migrations/0001), so the
 *   runtime `worker_user` role needs DML only.
 */
export interface PgBossQueueOptions {
  /** Direct connection string for the `worker_user` role. */
  connectionString: string;
  /** Defaults to the spec-fixed `pgboss` schema. */
  schema?: string;
  /** Polling floor used when a worker registration omits it. */
  pollingIntervalSeconds?: number;
  logger?: Logger;
}

const DEFAULT_SCHEMA = "pgboss";
const DEFAULT_POLLING_SECONDS = 2;

/**
 * pg-boss validates every provided option key, so `undefined` values must
 * be omitted entirely rather than passed through.
 */
function defined<T extends object>(options: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

export class PgBossJobQueue implements JobQueue {
  private readonly boss: PgBoss;
  private readonly logger: Logger | undefined;
  private readonly pollingIntervalSeconds: number;
  private readonly ensuredQueues = new Set<string>();
  private started = false;

  constructor(options: PgBossQueueOptions) {
    this.logger = options.logger;
    this.pollingIntervalSeconds = options.pollingIntervalSeconds ?? DEFAULT_POLLING_SECONDS;
    this.boss = new PgBoss({
      connectionString: options.connectionString,
      schema: options.schema ?? DEFAULT_SCHEMA,
      // The migrator owns DDL (packages/db migrations/0001_pgboss.migrate.cjs
      // installs getConstructionPlans("pgboss")). The runtime role has DML
      // only, so pg-boss must never attempt to create or migrate anything.
      migrate: false,
      createSchema: false,
      // One Render service runs a single inline worker; keep maintenance
      // cheap and off the Neon free-tier sleep path.
      supervise: false,
      schedule: true,
    });
    this.boss.on("error", (error: Error) => {
      this.logger?.error("pg-boss error", { error: error.message });
    });
    this.boss.on("warning", (warning: { message?: string } | Error) => {
      const message = warning instanceof Error ? warning.message : (warning.message ?? "unknown warning");
      this.logger?.warn("pg-boss warning", { warning: message });
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    await this.boss.start();
    this.started = true;
  }

  /**
   * pg-boss v12 sends target named queues that must exist (rows in
   * `pgboss.queue`, so creating one is plain DML — allowed for the
   * runtime role). Queues are created lazily and idempotently; a lost
   * race with another creator is ignored.
   */
  private async ensureQueue(name: string): Promise<void> {
    if (this.ensuredQueues.has(name)) return;
    const existing = await this.boss.getQueue(name).catch(() => null);
    if (!existing) {
      await this.boss.createQueue(name).catch(() => undefined);
    }
    this.ensuredQueues.add(name);
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    await this.boss.stop();
    this.started = false;
  }

  async enqueue(
    name: string,
    data?: object | null,
    options?: EnqueueOptions,
  ): Promise<string | null> {
    await this.ensureQueue(name);
    return this.boss.send(
      name,
      data ?? null,
      defined({
        retryLimit: options?.retryLimit ?? 0,
        retryDelay: options?.retryDelaySeconds,
        singletonKey: options?.singletonKey,
        expireInSeconds: options?.expireInSeconds,
        startAfter: options?.delaySeconds,
      }),
    );
  }

  async schedule(
    name: string,
    cron: string,
    data?: object | null,
    options?: EnqueueOptions,
  ): Promise<void> {
    await this.ensureQueue(name);
    await this.boss.schedule(
      name,
      cron,
      data ?? null,
      defined({
        retryLimit: options?.retryLimit ?? 0,
        retryDelay: options?.retryDelaySeconds,
        singletonKey: options?.singletonKey,
        expireInSeconds: options?.expireInSeconds,
      }),
    );
  }

  async work(
    name: string,
    handler: JobHandler,
    options?: RegisterWorkerOptions,
  ): Promise<string> {
    await this.ensureQueue(name);
    // pg-boss v12 handlers receive a batch (default size 1) of jobs.
    return this.boss.work(name, {
      pollingIntervalSeconds: options?.pollingIntervalSeconds ?? this.pollingIntervalSeconds,
    }, async (jobs: Array<{ id: string; data: unknown }>) => {
      for (const job of jobs) {
        try {
          await handler({ id: job.id, data: job.data });
        } catch (error) {
          this.logger?.error("job handler failed", {
            job: name,
            jobId: job.id,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      }
    });
  }
}
