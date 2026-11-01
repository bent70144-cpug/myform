import { describe, expect, it } from "vitest";
import { EnvValidationError, loadEnv } from "../src/env";
import { childEnvAllowlist } from "../src/supervisor";
import { FORBIDDEN_WEB_ENV_KEYS, apiEnvSchema, webEnvSchema, workerEnvSchema } from "../src/schemas";

describe("loadEnv", () => {
  it("parses a valid API environment with defaults", () => {
    const env = loadEnv(apiEnvSchema, { DATABASE_URL: "postgres://app_user:pw@127.0.0.1:5432/myform" });
    expect(env.DATABASE_URL).toBe("postgres://app_user:pw@127.0.0.1:5432/myform");
    expect(env.API_PORT).toBe(4000);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.MYFORM_ENV).toBe("development");
  });

  it("coerces numeric ports from strings", () => {
    const env = loadEnv(apiEnvSchema, {
      DATABASE_URL: "postgres://app_user:pw@127.0.0.1:5432/myform",
      API_PORT: "54321",
    });
    expect(env.API_PORT).toBe(54321);
  });

  it("fails at startup on a missing required value", () => {
    expect(() => loadEnv(apiEnvSchema, {})).toThrow(EnvValidationError);
  });

  it("fails on an invalid value and names the offending key", () => {
    try {
      loadEnv(apiEnvSchema, { DATABASE_URL: "postgres://ok", API_PORT: "not-a-port" });
      expect.unreachable("loadEnv should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      const issues = (err as EnvValidationError).issues.join("\n");
      expect(issues).toContain("API_PORT");
    }
  });

  it("collects every issue, not only the first", () => {
    try {
      loadEnv(apiEnvSchema, {});
      expect.unreachable();
    } catch (err) {
      const issues = (err as EnvValidationError).issues;
      expect(issues.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("worker env", () => {
  it("requires the worker database URL", () => {
    expect(() => loadEnv(workerEnvSchema, {})).toThrow(EnvValidationError);
    const env = loadEnv(workerEnvSchema, {
      WORKER_DATABASE_URL: "postgres://worker_user:pw@127.0.0.1:5432/myform",
    });
    expect(env.WORKER_HEARTBEAT_MS).toBe(15_000);
  });
});

describe("web environment definition", () => {
  const publicEnv = {
    APP_ORIGIN: "http://localhost:3000",
    INTERNAL_API_URL: "http://127.0.0.1:4000",
  };

  it("accepts the public variables", () => {
    const env = loadEnv(webEnvSchema, publicEnv);
    expect(env.INTERNAL_API_URL).toBe("http://127.0.0.1:4000");
  });

  it("rejects database credentials and auth secrets (CI check)", () => {
    for (const forbidden of FORBIDDEN_WEB_ENV_KEYS) {
      expect(
        () => loadEnv(webEnvSchema, { ...publicEnv, [forbidden]: "leak" }),
        `${forbidden} must not be valid web env`,
      ).toThrow(EnvValidationError);
    }
  });

  it("exposes exactly the public keys as the web allowlist", () => {
    // The web env definition and the supervisor allowlist must stay in sync.
    const allowed = new Set(childEnvAllowlist("web"));
    for (const key of FORBIDDEN_WEB_ENV_KEYS) {
      expect(allowed.has(key)).toBe(false);
    }
    for (const key of Object.keys(webEnvSchema.shape)) {
      expect(allowed.has(key), `allowlist must pass through ${key}`).toBe(true);
    }
  });
});
