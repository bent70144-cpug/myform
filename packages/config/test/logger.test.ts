import { describe, expect, it } from "vitest";
import {
  REDACTED_PLACEHOLDER,
  REDACT_PATHS,
  createLogger,
} from "../src/logger";

/** Collects everything the logger writes so tests can assert on raw output. */
function captureLogger(name = "test") {
  const chunks: string[] = [];
  const stream = {
    write(chunk: string) {
      chunks.push(chunk);
    },
  } as never;
  const logger = createLogger({ name, level: "info", destination: stream });
  return {
    logger,
    output: () => chunks.join(""),
  };
}

describe("structured logger redaction", () => {
  it("declares the guardrail paths (cookie, authorization, tokens)", () => {
    const joined = REDACT_PATHS.join("\n");
    expect(joined).toContain("req.headers.cookie");
    expect(joined).toContain("req.headers.authorization");
    expect(joined).toContain("cookies");
    expect(joined).toContain("password");
    expect(joined).toContain("token");
  });

  it("redacts cookies, authorization headers and auth tokens", () => {
    const { logger, output } = captureLogger();
    logger.info({
      req: {
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: {
          cookie: "better-auth.session_token=SECRETCOOKIE123",
          authorization: "Bearer SECRETBEARER456",
          "content-type": "application/json",
        },
      },
      password: "SECRETPW789",
      token: "SECRETTOKEN012",
      sessionToken: "SECRETSESSION345",
    });
    const out = output();
    expect(out).not.toContain("SECRETCOOKIE123");
    expect(out).not.toContain("SECRETBEARER456");
    expect(out).not.toContain("SECRETPW789");
    expect(out).not.toContain("SECRETTOKEN012");
    expect(out).not.toContain("SECRETSESSION345");
    expect(out).toContain(REDACTED_PLACEHOLDER);
    // Non-sensitive fields still render.
    expect(out).toContain("/v1/auth/sign-in");
  });

  it("redacts NESTED authorization/cookies/token fields (worker job payloads)", () => {
    // Review round 3: the worker logs through this factory now, so the
    // one-level-deep wildcard locations must be covered too — a handler
    // logging `{ context: { authorization, cookies, token } }` still redacts.
    const { logger, output } = captureLogger();
    logger.info({
      event: "worker.session_purge",
      context: {
        authorization: "Bearer NESTEDBEARER789",
        cookies: "better-auth.session_token=NESTEDCOOKIE456",
        token: "NESTEDTOKEN123",
      },
      job: "session.purge",
    });
    const out = output();
    expect(out).not.toContain("NESTEDBEARER789");
    expect(out).not.toContain("NESTEDCOOKIE456");
    expect(out).not.toContain("NESTEDTOKEN123");
    expect(out).toContain(REDACTED_PLACEHOLDER);
    // Non-sensitive sibling fields still render.
    expect(out).toContain("worker.session_purge");
    expect(out).toContain("session.purge");
  });

  it("keeps non-sensitive data intact and produces JSON lines", () => {
    const { logger, output } = captureLogger();
    logger.info({ msg: "hello", requestId: "abc-123" });
    const out = output();
    const parsed = JSON.parse(out.trim()) as Record<string, unknown>;
    expect(parsed["msg"]).toBe("hello");
    expect(parsed["requestId"]).toBe("abc-123");
    expect(parsed["service"]).toBe("test");
  });
});
