import { Controller, Get, HttpCode, Inject, Res } from "@nestjs/common";
import type { Response } from "express";
import { healthResponse, type HealthResponse } from "@myform/contracts";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  // Explicit @Inject (not design:paramtypes metadata) so DI also works under
  // esbuild-based tooling, which does not emit decorator metadata.
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  /**
   * `GET /v1/health` — process liveness plus database reachability, no
   * tenant data. When the database is unreachable the body keeps the same
   * health shape with `status: "error"` and a 503 HTTP status, per the
   * OpenAPI contract.
   */
  @Get()
  @HttpCode(200)
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const database = await this.health.databaseStatus();
    const { ok, body } = healthResponse({ database, service: "api" });
    if (!ok) {
      res.status(503);
    }
    return body;
  }
}

