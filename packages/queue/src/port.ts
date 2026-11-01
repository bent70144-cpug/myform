/**
 * JobQueue port (spec: "Queue, outbox, and audit").
 *
 * Domain code depends on this interface only; the pg-boss adapter implements
 * it today and a BullMQ adapter replaces it at beta without changing domain
 * code. The port exposes enqueue, schedule, and worker registration.
 */

/** Options accepted when enqueuing a one-off job. */
export interface EnqueueOptions {
  /** Defer the job by this many seconds before it becomes available. */
  delaySeconds?: number;
  /** Retry this many times on failure before the job dead-letters. */
  retryLimit?: number;
  /** Base backoff between retries, in seconds. */
  retryDelaySeconds?: number;
  /** Adapter-specific deduplication key (pg-boss `singletonKey`). */
  singletonKey?: string;
  /** Fail the job if a single attempt exceeds this duration, in seconds. */
  expireInSeconds?: number;
}

/** Options for worker registration. */
export interface RegisterWorkerOptions {
  /** How often the worker polls for available jobs, in seconds. */
  pollingIntervalSeconds?: number;
}

/** A handler registered for a job name. Throwing fails the attempt. */
export type JobHandler = (job: { id: string; data: unknown }) => Promise<void> | void;

/**
 * The queue seam. Implemented by the pg-boss adapter (alpha) and BullMQ
 * (beta). All queue access goes through this port — domain code never
 * touches pg-boss types directly.
 */
export interface JobQueue {
  /** Connect and begin accepting work (idempotent). */
  start(): Promise<void>;
  /** Disconnect gracefully, letting in-flight jobs finish (idempotent). */
  stop(): Promise<void>;
  /** Enqueue a one-off job; resolves with the job id (or null). */
  enqueue(name: string, data?: object | null, options?: EnqueueOptions): Promise<string | null>;
  /** Register a recurring job on a cron expression. */
  schedule(
    name: string,
    cron: string,
    data?: object | null,
    options?: EnqueueOptions,
  ): Promise<void>;
  /** Register a handler that polls for and processes jobs of `name`. */
  work(name: string, handler: JobHandler, options?: RegisterWorkerOptions): Promise<string>;
}
