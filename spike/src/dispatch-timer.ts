import type { PgBoss } from "pg-boss";

/**
 * The alpha dispatch strategy (spike decision — see spike/DECISIONS.md and
 * docs/adr ADR-0005): pg-boss runs with `schedule: false` (its cron
 * timekeeper would poll Postgres every few seconds and keep Neon awake)
 * and NO persistent `work()` registration (the default 2s poll has the
 * same problem). Instead this Node-side timer fires roughly every ten
 * minutes, briefly registers a worker, enqueues the dispatch job, lets it
 * run, and unregisters — so between dispatch windows the worker process
 * issues ZERO Postgres queries and Neon is allowed to sleep.
 *
 * Ticket 05 (outbox dispatcher) owns the production version; this class is
 * the spike proof that the strategy works and keeps the database quiet.
 */
export interface DispatchTimerOptions {
  /** The raw pg-boss instance (constructed with schedule:false). */
  boss: Pick<PgBoss, "send" | "work" | "offWork">;
  /** Job name to enqueue per tick (alpha: `outbox.dispatch`). */
  jobName: string;
  /** Alpha production value is ~10 minutes; tests pass a small value. */
  intervalMs: number;
  payload?: object;
  /** Seconds between polls while the temporary worker is registered. */
  dispatchPollingIntervalSeconds?: number;
  onTick?: (tick: number, jobId: string | null) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class NodeSideDispatchTimer {
  private timer: NodeJS.Timeout | undefined;
  private inFlight = false;
  private ticks = 0;

  constructor(private readonly options: DispatchTimerOptions) {}

  /** Start ticking: first dispatch immediately, then every intervalMs. */
  start(): void {
    if (this.timer !== undefined) return;
    const run = (): void => {
      void this.dispatchOnce().catch(() => undefined);
    };
    run();
    this.timer = setInterval(run, this.options.intervalMs);
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  get dispatchedTicks(): number {
    return this.ticks;
  }

  /**
   * One dispatch window: register a short-lived worker, enqueue the job,
   * wait for it to be processed, unregister. Deduplicated: overlapping
   * ticks are skipped.
   */
  async dispatchOnce(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      let processed = 0;
      // Register first so the initial poll is already live when the job
      // is sent (pg-boss v12 fetches as soon as a worker is registered).
      await this.options.boss.work(
        this.options.jobName,
        { pollingIntervalSeconds: this.options.dispatchPollingIntervalSeconds ?? 1 },
        async () => {
          processed += 1;
        },
      );
      let jobId: string | null = null;
      try {
        jobId = await this.options.boss.send(this.options.jobName, this.options.payload ?? null);
        const deadline = Date.now() + 30_000;
        while (processed === 0 && Date.now() < deadline) {
          await sleep(50);
        }
      } finally {
        await this.options.boss.offWork(this.options.jobName).catch(() => undefined);
      }
      if (processed > 0) {
        this.ticks += 1;
        this.options.onTick?.(this.ticks, jobId);
      }
    } finally {
      this.inFlight = false;
    }
  }
}
