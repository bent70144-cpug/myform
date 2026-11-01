import type { WorkerEnv } from "@myform/config";
import { OUTBOX_DISPATCH_JOB, type JobQueue } from "@myform/queue";
import type { Logger } from "@myform/logger";

/**
 * The inline worker (spec: "Repository and runtime", "Queue, outbox, and
 * audit"). It owns asynchronous processing: a polling pg-boss consumer plus
 * a logged heartbeat so liveness is observable in the alpha's single
 * supervisor process.
 *
 * The outbox dispatcher's real work (claiming events with FOR UPDATE SKIP
 * LOCKED, retries, dead-lettering) arrives with the workspace-bootstrap
 * slice, the first producer. M0 wires the consumer registration and proves
 * jobs flow end to end.
 */
export class MyformWorker {
  private readonly logger: Logger;
  private readonly queue: JobQueue;
  private readonly env: WorkerEnv;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private running = false;
  private dispatchCount = 0;

  constructor(options: { env: WorkerEnv; logger: Logger; queue: JobQueue }) {
    this.env = options.env;
    this.logger = options.logger;
    this.queue = options.queue;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.queue.start();
    await this.queue.work(OUTBOX_DISPATCH_JOB, async () => {
      this.dispatchCount += 1;
      this.logger.info("outbox dispatch tick", { ticks: this.dispatchCount });
    });
    this.heartbeatTimer = setInterval(() => {
      this.logger.info("worker heartbeat", {
        everyMs: this.env.WORKER_HEARTBEAT_MS,
        dispatchTicks: this.dispatchCount,
      });
    }, this.env.WORKER_HEARTBEAT_MS);
    // Never keep the event loop alive just for the heartbeat.
    this.heartbeatTimer.unref?.();
    this.logger.info("worker started", { heartbeatMs: this.env.WORKER_HEARTBEAT_MS });
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    if (this.heartbeatTimer !== undefined) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    await this.queue.stop();
    this.logger.info("worker stopped", { dispatchTicks: this.dispatchCount });
  }

  get dispatched(): number {
    return this.dispatchCount;
  }
}
