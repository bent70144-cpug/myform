import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Pool } from "pg";
import { createLogger } from "@myform/logger";
import { readApiEnv } from "./env";
import { ApiModule } from "./app.module";
import { configureApiApp } from "./configure";

/**
 * API composition root. Fails at startup when the environment is missing
 * or invalid (Zod), connects to Postgres as `app_user` (pooled URL), and
 * serves `/v1` on the internal API port.
 */
async function main(): Promise<void> {
  const env = readApiEnv();
  const logger = createLogger({ service: "api", level: env.LOG_LEVEL });

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    // Bounded so a dead database fails health checks quickly instead of
    // hanging request handlers.
    connectionTimeoutMillis: 3_000,
  });

  const app = await NestFactory.create<NestExpressApplication>(
    ApiModule.register({ env, pool }),
    { logger: false },
  );
  configureApiApp(app, logger);
  // Explicit body limit (spec: "Form schema and versioning") — configured,
  // not inherited from the adapter default.
  app.useBodyParser("json", { limit: "300kb" });

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    logger.info("api shutting down", { signal });
    try {
      await app.close();
    } finally {
      await pool.end();
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen(env.API_PORT, "0.0.0.0");
  logger.info("api listening", { port: env.API_PORT });
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `api failed to start: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
