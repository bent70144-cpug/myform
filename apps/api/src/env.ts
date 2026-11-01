import { loadEnv, apiEnvSchema, type ApiEnv, type EnvSource } from "@myform/config";

/**
 * Parse and validate the API environment at startup (spec: "Deployment and
 * configuration" — Zod-validated, fails fast on missing/invalid values).
 * The API receives the pooled `app_user` DATABASE_URL and nothing else.
 */
export const API_ENV = Symbol("API_ENV");

export function readApiEnv(source: EnvSource = process.env as EnvSource): ApiEnv {
  return loadEnv(apiEnvSchema, source);
}
