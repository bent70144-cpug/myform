import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger, type Sink } from "../src/logger";
import { REDACTED, redactValue } from "../src/redact";

function capture(): { lines: string[]; sink: Sink } {
  const lines: string[] = [];
  return { lines, sink: (line) => lines.push(line) };
}

describe("redactValue", () => {
  it("redacts authorization headers, cookies, and tokens by key", () => {
    const input = {
      authorization: "Bearer abc.def.ghi",
      cookie: "session=abc",
      "set-cookie": ["a=b"],
      accessToken: "tok_123",
      refresh_token: "xyz",
      password: "hunter2",
      AUTH_SECRET: "s3cret",
      apiKey: "key_123",
      headers: { authorization: "Bearer abc", cookie: "session=abc" },
      keep: "visible",
    };
    const out = redactValue(input) as Record<string, unknown>;
    expect(out.authorization).toBe(REDACTED);
    expect(out.cookie).toBe(REDACTED);
    expect(out["set-cookie"]).toBe(REDACTED);
    expect(out.accessToken).toBe(REDACTED);
    expect(out.refresh_token).toBe(REDACTED);
    expect(out.password).toBe(REDACTED);
    expect(out.AUTH_SECRET).toBe(REDACTED);
    expect(out.apiKey).toBe(REDACTED);
    expect(out.headers).toEqual({ authorization: REDACTED, cookie: REDACTED });
    expect(out.keep).toBe("visible");
  });

  it("scrubs bearer tokens and JWT-like strings inside plain strings", () => {
    expect(redactValue("Bearer abcdefgh.ijklmnop.qrstuvwx")).toBe("[REDACTED]");
    expect(redactValue("failed for token 9f86d081884c7d65 in slot 1")).toContain("[REDACTED]");
    expect(redactValue("ordinary message")).toBe("ordinary message");
  });

  it("serializes Error values without leaking credentials in messages", () => {
    const err = new Error("login failed for token supersecretvalue");
    const out = redactValue(err) as { name: string; message: string };
    expect(out.name).toBe("Error");
    expect(out.message).toContain("[REDACTED]");
  });

  it("redacts values inside arrays and deep objects", () => {
    const out = redactValue([{ nested: { sessionCookie: "x" } }]) as Array<{ nested: { sessionCookie: string } }>;
    expect(out[0]?.nested.sessionCookie).toBe(REDACTED);
  });
});

describe("createLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits one JSON object per line with time, level, service, msg", () => {
    const { lines, sink } = capture();
    const fixed = 1_700_000_000_000;
    const log = createLogger({ service: "api", level: "info", sink, now: () => fixed });
    log.info("hello", { requestId: "r1" });
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(record.time).toBe(new Date(fixed).toISOString());
    expect(record.level).toBe("info");
    expect(record.service).toBe("api");
    expect(record.msg).toBe("hello");
    expect(record.requestId).toBe("r1");
  });

  it("redacts credential fields in emitted records", () => {
    const { lines, sink } = capture();
    const log = createLogger({ service: "api", sink });
    log.info("request", { req: { headers: { authorization: "Bearer abc", cookie: "sid=1" } } });
    const record = JSON.parse(lines[0]!) as { req: { headers: Record<string, string> } };
    expect(record.req.headers.authorization).toBe(REDACTED);
    expect(record.req.headers.cookie).toBe(REDACTED);
  });

  it("filters below the configured level", () => {
    const { lines, sink } = capture();
    const log = createLogger({ service: "api", level: "warn", sink });
    log.debug("noisy");
    log.info("chatty");
    log.warn("warning");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).level).toBe("warn");
  });

  it("child loggers merge bindings", () => {
    const { lines, sink } = capture();
    const log = createLogger({ service: "worker", sink }).child({ component: "queue" });
    log.info("started", { attempt: 1 });
    const record = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(record.component).toBe("queue");
    expect(record.attempt).toBe(1);
    expect(record.service).toBe("worker");
  });
});
