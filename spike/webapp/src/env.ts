import { loadEnv, pickWebEnv, webEnvSchema, type EnvSource, type WebEnv } from "@myform/config";

/**
 * Web environment for the spike app — same loader pattern as apps/web:
 * `pickWebEnv` filters the raw process environment down to the allowlist
 * before strict validation, mirroring the supervisor's process-level
 * allowlist.
 */
export function readWebEnv(source: EnvSource = process.env as EnvSource): WebEnv {
  return loadEnv(webEnvSchema, pickWebEnv(source));
}
