import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Pool } from "pg";
import { toNodeHandler } from "better-auth/node";
import { readSpikeApiEnv } from "../spike-env.js";
import { createSpikeAuth } from "../spike-auth.js";
import { SpikeApiModule } from "./spike-api.module.js";

/**
 * Spike API composition root — mirrors apps/api/main.ts (Zod env, pool as
 * `app_user`, global /v1 prefix) plus the part the spike exists to prove:
 * the Better Auth handler mounted under `/v1/auth` BEFORE Nest's body
 * parser registers, so better-auth receives the untouched request stream.
 */
async function main(): Promise<void> {
  const env = readSpikeApiEnv();
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 3_000,
  });

  const auth = createSpikeAuth({
    pool,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_ORIGIN,
  });
  const authHandler = toNodeHandler(auth);

  const app = await NestFactory.create<NestExpressApplication>(SpikeApiModule, {
    logger: false,
  });
  // Mount Better Auth at the raw Node level, gated to /v1/auth so the URL
  // is NOT stripped by an express mount path and better-auth's basePath
  // routing works. Registered before app.init(), so it runs ahead of the
  // body parser (toNodeHandler consumes the raw stream itself).
  app.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? "/";
    if (url === "/v1/auth" || url.startsWith("/v1/auth/")) {
      void authHandler(req, res);
      return;
    }
    next();
  });
  app.setGlobalPrefix("v1");
  app.enableShutdownHooks();

  const closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    process.stderr.write(`[spike-api] shutting down (${signal})\n`);
    try {
      await app.close();
    } finally {
      await pool.end();
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen(env.API_PORT, "0.0.0.0");
  process.stdout.write(`[spike-api] listening on :${env.API_PORT}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `spike-api failed to start: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
