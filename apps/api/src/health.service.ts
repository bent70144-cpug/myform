import { Injectable, Inject } from "@nestjs/common";
import type { Pool } from "pg";
import type { ComponentStatus } from "@myform/contracts";

/** DI token for the shared `app_user` connection pool. */
export const DATABASE_POOL = Symbol("DATABASE_POOL");

/**
 * Liveness probes. Health checks must never expose tenant data — a bare
 * `SELECT 1` is enough to prove reachability.
 */
@Injectable()
export class HealthService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pick<Pool, "query">) {}

  async databaseStatus(): Promise<ComponentStatus> {
    try {
      await this.pool.query("SELECT 1");
      return "up";
    } catch {
      return "down";
    }
  }
}
