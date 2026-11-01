import { Module, type DynamicModule } from "@nestjs/common";
import type { ApiEnv } from "@myform/config";
import type { Pool } from "pg";
import { API_ENV, } from "./env";
import { DATABASE_POOL, HealthService } from "./health.service";
import { HealthController } from "./health.controller";
import { OpenApiController } from "./openapi.controller";

/**
 * Root API module. Registered with concrete `env`/`pool` instances so the
 * composition root (main.ts, tests) controls construction — the Zod env
 * parse happens before Nest boots, so bad configuration never starts a
 * half-initialized app.
 */
@Module({})
export class ApiModule {
  static register(options: { env: ApiEnv; pool: Pick<Pool, "query"> }): DynamicModule {
    return {
      module: ApiModule,
      providers: [
        { provide: API_ENV, useValue: options.env },
        { provide: DATABASE_POOL, useValue: options.pool },
        HealthService,
      ],
      controllers: [HealthController, OpenApiController],
    };
  }
}
