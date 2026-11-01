import { FORBIDDEN_WEB_ENV_KEYS, WEB_ENV_KEYS } from "@myform/config";

/**
 * In-process environment probe for the supervisor-allowlist spike proof.
 * Runs INSIDE the real Next.js server process (spawned with exactly
 * `buildChildEnv("web", ...)` output) and reports which forbidden keys and
 * which allowlisted keys are present in `process.env` at request time.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const forbiddenPresent = FORBIDDEN_WEB_ENV_KEYS.filter((key) => key in process.env);
  const allowlistedPresent = WEB_ENV_KEYS.filter((key) => key in process.env);
  return Response.json(
    {
      pid: process.pid,
      nodeEnv: process.env["NODE_ENV"] ?? null,
      forbiddenPresent,
      forbiddenKeysChecked: FORBIDDEN_WEB_ENV_KEYS,
      allowlistedPresent,
      allEnvKeys: Object.keys(process.env).sort(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
