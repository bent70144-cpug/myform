import { z } from "zod";

const deploymentEnv = z.enum(["development", "test", "production"]).default("development");
const logLevel = z.enum(["debug", "info", "warn", "error"]).default("info");
const port = z.coerce.number().int().min(1).max(65535);

/** Keep only the named keys from a raw environment, dropping undefined. */
function pickEnvByKeys(
  keys: readonly string[],
  source: Record<string, string | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}

/**
 * API (NestJS) environment. The API owns database access for request
 * handling, so it receives the pooled app_user `DATABASE_URL`.
 */
export const apiEnvSchema = z
  .object({
    MYFORM_ENV: deploymentEnv,
    LOG_LEVEL: logLevel,
    API_PORT: port.default(4000),
    APP_ORIGIN: z.url().default("http://localhost:3000"),
    DATABASE_URL: z.url(),
  })
  .strict();

export type ApiEnv = z.output<typeof apiEnvSchema>;

/**
 * Filter a raw process environment down to the API allowlist before
 * validation: OS/shell noise (PATH, NODE_ENV, ...) is ignored, while the
 * strict schema still fails on missing or invalid required values.
 */
export function pickApiEnv(source: Record<string, string | undefined>): Record<string, string> {
  return pickEnvByKeys(Object.keys(apiEnvSchema.shape), source);
}

/**
 * Worker environment. The worker connects as `worker_user` over a direct
 * URL; it never receives the web origin or auth secrets.
 */
export const workerEnvSchema = z
  .object({
    MYFORM_ENV: deploymentEnv,
    LOG_LEVEL: logLevel,
    WORKER_DATABASE_URL: z.url(),
    WORKER_HEARTBEAT_MS: z.coerce.number().int().min(250).max(3_600_000).default(15_000),
  })
  .strict();

export type WorkerEnv = z.output<typeof workerEnvSchema>;

/** Filter a raw environment down to the worker allowlist (see pickApiEnv). */
export function pickWorkerEnv(source: Record<string, string | undefined>): Record<string, string> {
  return pickEnvByKeys(Object.keys(workerEnvSchema.shape), source);
}

/**
 * Web (Next.js) environment definition. This is the whole point of a
 * separate web schema: it is impossible to configure the web app with a
 * database URL or an auth secret — the schema is strict, so any unknown key
 * (e.g. `DATABASE_URL`, `AUTH_SECRET`) fails validation. The web app talks
 * to the API through `INTERNAL_API_URL` only.
 */
export const webEnvSchema = z
  .object({
    MYFORM_ENV: deploymentEnv,
    APP_ORIGIN: z.url().default("http://localhost:3000"),
    INTERNAL_API_URL: z.url().default("http://127.0.0.1:4000"),
  })
  .strict();

export type WebEnv = z.output<typeof webEnvSchema>;

/**
 * Keys that must never appear in the Next.js process environment. Checked
 * by the supervisor allowlist and asserted against the web env definition
 * in CI.
 */
export const FORBIDDEN_WEB_ENV_KEYS = [
  "DATABASE_URL",
  "WORKER_DATABASE_URL",
  "MIGRATOR_DATABASE_URL",
  "ADMIN_DATABASE_URL",
  "MIGRATOR_PASSWORD",
  "APP_USER_PASSWORD",
  "WORKER_USER_PASSWORD",
  "AUTH_SECRET",
] as const;

/** Keys accepted by the web env definition (allowlist source of truth). */
export const WEB_ENV_KEYS = Object.keys(webEnvSchema.shape);

/**
 * Filter a raw environment down to the web allowlist. The web process
 * loads its config through this: unknown keys (a real shell env has
 * dozens) are ignored, and credential keys are dropped, matching the
 * supervisor's process-level allowlist.
 */
export function pickWebEnv(source: Record<string, string | undefined>): Record<string, string> {
  return pickEnvByKeys(WEB_ENV_KEYS, source);
}
