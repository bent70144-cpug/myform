#!/usr/bin/env node
/**
 * The spawned "web child" used by the supervisor-env spike test. Runs with
 * EXACTLY the environment the production supervisor's `buildChildEnv("web",
 * ...)` produces, and asserts IN ITS OWN PROCESS that no forbidden key
 * (DATABASE_URL, MIGRATOR_DATABASE_URL, auth secrets) is present — the
 * process-level proof the ticket requires (ticket 01's unit test only
 * checks the allowlist function's return value).
 *
 * Prints a JSON verdict on stdout and exits 0 only when the environment is
 * clean and the web env schema still loads (so the Next app could boot).
 */
const { FORBIDDEN_WEB_ENV_KEYS, loadEnv, pickWebEnv, webEnvSchema } = require("@myform/config");

const forbidden = FORBIDDEN_WEB_ENV_KEYS.filter((key) => key in process.env);

let webEnv = null;
let webEnvError = null;
try {
  webEnv = loadEnv(webEnvSchema, pickWebEnv(process.env));
} catch (error) {
  webEnvError = error instanceof Error ? error.message : String(error);
}

process.stdout.write(
  `${JSON.stringify({
    pid: process.pid,
    forbiddenPresent: forbidden,
    forbiddenKeysChecked: FORBIDDEN_WEB_ENV_KEYS,
    allEnvKeys: Object.keys(process.env).sort(),
    webEnvLoaded: webEnv,
    webEnvError,
  })}\n`,
);

if (forbidden.length > 0 || webEnvError !== null) {
  process.exit(3);
}
