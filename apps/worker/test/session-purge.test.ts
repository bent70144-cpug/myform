import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ticket 10 — unit tests for the `session.purge` handler. The DB call is
 * mocked the same way the outbox handler tests mock their seams; the REAL
 * helper + schedule wiring is exercised against Postgres in
 * outbox-worker.test.ts.
 */
vi.mock("@form/database", () => ({
  purgeExpiredSessions: vi.fn(),
}));

import { purgeExpiredSessions } from "@form/database";
import {
  SESSION_PURGE_JOB,
  createSessionPurgeHandler,
} from "../src/handlers/session-purge";

const purgeMock = vi.mocked(purgeExpiredSessions);

const silentLogger = {
  info: () => undefined,
  error: () => undefined,
};

describe("session.purge handler (ticket 10)", () => {
  beforeEach(() => {
    purgeMock.mockReset();
  });

  it("uses the documented job name", () => {
    expect(SESSION_PURGE_JOB).toBe("session.purge");
  });

  it("runs the purge helper once per tick with the worker pool and logs the deleted count", async () => {
    purgeMock.mockResolvedValue(4);
    const lines: Array<Record<string, unknown>> = [];
    const pool = { query: async () => ({ rows: [] }) } as never;
    const handler = createSessionPurgeHandler({
      pool,
      logger: { ...silentLogger, info: (line) => lines.push(line) },
    });

    await handler();

    expect(purgeMock).toHaveBeenCalledTimes(1);
    expect(purgeMock).toHaveBeenCalledWith(pool);
    expect(lines).toEqual([
      expect.objectContaining({ event: "worker.session_purge", deleted: 4 }),
    ]);
  });

  it("logs and rethrows failures so the queue adapter retries the tick", async () => {
    purgeMock.mockRejectedValue(new Error("connection refused"));
    const errors: Array<Record<string, unknown>> = [];
    const handler = createSessionPurgeHandler({
      pool: {} as never,
      logger: { ...silentLogger, error: (line) => errors.push(line) },
    });

    await expect(handler()).rejects.toThrow("connection refused");
    expect(errors).toEqual([
      expect.objectContaining({
        event: "worker.session_purge_error",
        message: expect.stringContaining("connection refused"),
      }),
    ]);
  });
});
