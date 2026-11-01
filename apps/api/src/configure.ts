import type { INestApplication } from "@nestjs/common";
import type { Logger } from "@myform/logger";
import { ProblemDetailsFilter } from "./problem.filter";

/**
 * Shared application wiring used by both `main.ts` and the HTTP seam
 * tests, so tests exercise exactly the production configuration:
 * global `/v1` prefix and the RFC 9457 Problem Details filter.
 */
export function configureApiApp(app: INestApplication, logger: Logger): void {
  app.setGlobalPrefix("v1");
  app.useGlobalFilters(new ProblemDetailsFilter(logger.child({ component: "problem-filter" })));
  app.enableShutdownHooks();
}
