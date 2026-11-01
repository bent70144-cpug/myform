import { loadEnv, pickWebEnv, webEnvSchema, type EnvSource, type WebEnv } from "@myform/config";

/**
 * Web environment (spec: "Deployment and configuration"). `pickWebEnv`
 * filters the raw process environment down to the web allowlist before
 * validation, mirroring the supervisor's process-level allowlist: the web
 * app cannot read `DATABASE_URL`, auth secrets, or the migrator URL even
 * if they exist in the parent environment, and the strict Zod schema fails
 * startup on any invalid value.
 */
export function readWebEnv(source: EnvSource = process.env as EnvSource): WebEnv {
  return loadEnv(webEnvSchema, pickWebEnv(source));
}
