/**
 * Supervisor child-environment allowlist (spec: "Deployment and
 * configuration"). The alpha supervisor starts web, API, and worker as one
 * Render service; each child is spawned with an explicit allowlisted
 * environment. Next.js receives only public variables and the internal API
 * URL — never `DATABASE_URL`, auth secrets, or the migrator URL.
 */

export type ServiceName = "web" | "api" | "worker";

/** Keys every child needs to run as a plain Node process. */
const BASE_KEYS: readonly string[] = ["PATH", "HOME", "TMPDIR", "LANG", "NODE_ENV"];

const ALLOWLISTS: Record<ServiceName, readonly string[]> = {
  web: ["MYFORM_ENV", "APP_ORIGIN", "INTERNAL_API_URL"],
  api: ["MYFORM_ENV", "LOG_LEVEL", "API_PORT", "APP_ORIGIN", "DATABASE_URL"],
  worker: ["MYFORM_ENV", "LOG_LEVEL", "WORKER_DATABASE_URL", "WORKER_HEARTBEAT_MS"],
};

/**
 * Build a child process environment for `service` from `env`, keeping only
 * the base keys and the service allowlist. Unknown/forbidden keys are
 * dropped silently — the allowlist is the security boundary, not a denylist.
 */
export function buildChildEnv(
  service: ServiceName,
  env: Record<string, string | undefined>,
): Record<string, string> {
  const allowed = new Set<string>([...BASE_KEYS, ...ALLOWLISTS[service]]);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (allowed.has(key) && value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

export function childEnvAllowlist(service: ServiceName): readonly string[] {
  return ALLOWLISTS[service];
}
