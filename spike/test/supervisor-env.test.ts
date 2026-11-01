import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildChildEnv, FORBIDDEN_WEB_ENV_KEYS, WEB_ENV_KEYS } from "@myform/config";
import {
  dumpOnFailure,
  freePort,
  paths,
  spawnCaptured,
  waitForHttp,
  type SpawnedProcess,
} from "./helpers.js";

/**
 * Spike proof 1 — supervisor env allowlist, PROCESS level (spec:
 * "Deployment and configuration"; ticket 01 only unit-tested
 * `buildChildEnv`'s return value). The supervisor's own environment on
 * Render contains every secret; the Next child must receive none of them.
 *
 * Runs against a PRODUCTION Next server (`next build` + `next start`),
 * matching the alpha topology on Render — and, unlike dev mode, the route
 * handler runs in the same process as the spawned server, so the probe
 * observes the real web child's process.env.
 */

// What the alpha supervisor's own process.env looks like on Render: public
// web variables AND every database/auth secret, side by side.
const SUPERVISOR_ENV: Record<string, string> = {
  PATH: process.env["PATH"] ?? "/usr/bin",
  HOME: process.env["HOME"] ?? "/tmp",
  TMPDIR: "/tmp",
  LANG: "C.UTF-8",
  NODE_ENV: "production",
  MYFORM_ENV: "test",
  APP_ORIGIN: "http://localhost:3000",
  INTERNAL_API_URL: "http://127.0.0.1:4000",
  DATABASE_URL: "postgres://app_user:secret@db.example/myform",
  WORKER_DATABASE_URL: "postgres://worker_user:secret@db.example/myform",
  MIGRATOR_DATABASE_URL: "postgres://migrator:secret@db.example/myform",
  ADMIN_DATABASE_URL: "postgres://postgres:secret@db.example/myform",
  MIGRATOR_PASSWORD: "secret",
  APP_USER_PASSWORD: "secret",
  WORKER_USER_PASSWORD: "secret",
  AUTH_SECRET: "secret",
};

const ALLOWED_WEB_KEYS = new Set([
  "PATH",
  "HOME",
  "TMPDIR",
  "LANG",
  "NODE_ENV",
  "MYFORM_ENV",
  "APP_ORIGIN",
  "INTERNAL_API_URL",
]);

// Finding (recorded in spike/DECISIONS.md): the Next.js runtime itself
// injects a handful of non-secret keys into its own process.env. These are
// Next's own, not something the supervisor passed. The allowlist assertion
// below treats them as expected noise; anything else outside the allowlist
// must at least carry the NEXT_ namespace.
const NEXT_RUNTIME_INTRODUCED_KEYS = new Set([
  "NEXT_DEPLOYMENT_ID",
  "NEXT_PRIVATE_ALLOWED_UPGRADE_RETRIES",
  "NEXT_PRIVATE_DEV_SPAN_ATTRS",
  "NEXT_PRIVATE_ENABLED_FEATURES",
  "NEXT_PRIVATE_START_TIME",
  "NEXT_PRIVATE_TRACE_ID",
  "NEXT_PRIVATE_WORKER",
  "NEXT_RUNTIME",
  "NODE_OPTIONS",
  "PORT",
  "RUST_MIN_STACK",
  "TURBOPACK",
  "__NEXT_DEV_SERVER",
  "__NEXT_PRIVATE_ORIGIN",
]);

let probe: SpawnedProcess | undefined;
let next: SpawnedProcess | undefined;
const webPort = await freePort();

beforeAll(async () => {
  // Production build so `next start` serves route handlers in the same
  // process (dev mode forks a worker whose pid/env would not be the
  // spawned child's). Built with the allowlisted env only.
  const buildEnv = buildChildEnv("web", {
    ...SUPERVISOR_ENV,
    NODE_ENV: "production",
  });
  const build = spawnCaptured(process.execPath, [paths.nextBin, "build"], {
    cwd: paths.webappRoot,
    env: buildEnv,
  });
  const buildCode = await new Promise<number | null>((resolve, reject) => {
    build.child.on("exit", (code) => resolve(code));
    build.child.on("error", reject);
  });
  if (buildCode !== 0) {
    dumpOnFailure("next build stderr", build.stderr);
    dumpOnFailure("next build stdout", build.stdout);
    throw new Error(`next build failed with code ${buildCode}`);
  }
}, 240_000);

afterAll(() => {
  probe?.stop();
  next?.stop();
});

describe("supervisor env allowlist — process-level proofs", () => {
  it(
    "spawned web child (probe) contains no forbidden key in its own process.env",
    async () => {
      // Exactly what scripts/supervisor.mjs does for the web child.
      const childEnv = buildChildEnv("web", SUPERVISOR_ENV);
      probe = spawnCaptured(process.execPath, [paths.probe], { env: childEnv });
      const code = await new Promise<number | null>((resolve, reject) => {
        probe!.child.on("exit", (code) => resolve(code));
        probe!.child.on("error", reject);
      });
      expect(code, `probe stderr: ${probe.stderr}`).toBe(0);
      const verdict = JSON.parse(probe.stdout.trim()) as {
        forbiddenPresent: string[];
        forbiddenKeysChecked: readonly string[];
        allEnvKeys: string[];
        webEnvLoaded: Record<string, string> | null;
        webEnvError: string | null;
      };
      expect(verdict.forbiddenKeysChecked).toEqual(FORBIDDEN_WEB_ENV_KEYS);
      expect(verdict.forbiddenPresent).toEqual([]);
      expect(verdict.webEnvError).toBeNull();
      // The web app still boots from the allowlisted env alone.
      expect(verdict.webEnvLoaded).toMatchObject({
        MYFORM_ENV: "test",
        APP_ORIGIN: "http://localhost:3000",
        INTERNAL_API_URL: "http://127.0.0.1:4000",
      });
      // Nothing beyond the allowlist got through at all.
      for (const key of verdict.allEnvKeys) {
        expect(ALLOWED_WEB_KEYS.has(key), `unexpected key ${key} in child env`).toBe(true);
      }
    },
    30_000,
  );

  it(
    "real Next.js server spawned with the allowlisted env reports no forbidden keys from inside the process",
    async () => {
      const childEnv = buildChildEnv("web", {
        ...SUPERVISOR_ENV,
        INTERNAL_API_URL: "http://127.0.0.1:1",
      });
      next = spawnCaptured(
        process.execPath,
        [paths.nextBin, "start", "-p", String(webPort)],
        { cwd: paths.webappRoot, env: childEnv },
      );
      await waitForHttp(`http://127.0.0.1:${webPort}/`, 60_000).catch((error) => {
        dumpOnFailure("next stderr", next!.stderr);
        dumpOnFailure("next stdout", next!.stdout);
        throw error;
      });

      const res = await fetch(`http://127.0.0.1:${webPort}/env-probe`);
      expect(res.status).toBe(200);
      const verdict = (await res.json()) as {
        pid: number;
        forbiddenPresent: string[];
        allowlistedPresent: string[];
        allEnvKeys: string[];
      };

      // The in-process assertion the ticket asks for: none of the
      // forbidden keys exist in the Next process environment.
      expect(verdict.forbiddenPresent).toEqual([]);
      // Only public variables + the internal API URL made it through.
      expect(verdict.allowlistedPresent.sort()).toEqual([...WEB_ENV_KEYS].sort());
      // Anything else in the Next process env must come from Next's own
      // runtime, never from the supervisor environment.
      const runtimeIntroduced = verdict.allEnvKeys.filter(
        (key) => !ALLOWED_WEB_KEYS.has(key),
      );
      for (const key of runtimeIntroduced) {
        const known = NEXT_RUNTIME_INTRODUCED_KEYS.has(key);
        expect(
          known || key.startsWith("NEXT_") || key.startsWith("__NEXT_"),
          `unexpected non-allowlisted key ${key} in Next process env`,
        ).toBe(true);
      }
      process.stderr.write(
        `[spike] Next runtime-introduced env keys: ${runtimeIntroduced.join(", ") || "(none)"}\n`,
      );
      // The probe really is the spawned Next child process (production
      // mode serves route handlers in-process).
      expect(verdict.pid).toBe(next.child.pid);
    },
    120_000,
  );
});
