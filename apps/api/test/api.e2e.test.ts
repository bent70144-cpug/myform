import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Pool } from "pg";
import { startTestPostgres, type TestPostgres } from "@myform/db";
import { createLogger, type Logger } from "@myform/logger";
import type { ApiEnv } from "@myform/config";
import { ApiModule } from "../src/app.module";
import { configureApiApp } from "../src/configure";
import type { Pool as PoolType } from "pg";

const testLogger: Logger = createLogger({ service: "api-test", level: "error", sink: (line) => process.stderr.write(line + "\n") });

function testEnv(databaseUrl: string): ApiEnv {
  return {
    MYFORM_ENV: "test",
    LOG_LEVEL: "error",
    API_PORT: 4000,
    APP_ORIGIN: "http://localhost:3000",
    DATABASE_URL: databaseUrl,
  };
}

async function bootApp(env: ApiEnv, pool: Pick<PoolType, "query">): Promise<INestApplication> {
  const nest = await NestFactory.create(ApiModule.register({ env, pool }), { logger: false });
  configureApiApp(nest, testLogger);
  await nest.listen(0, "127.0.0.1");
  return nest;
}

let testDb: TestPostgres;
let pool: Pool;
let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  testDb = await startTestPostgres();
  pool = new Pool({ connectionString: testDb.appUrl, max: 2 });
  app = await bootApp(testEnv(testDb.appUrl), pool);
  const address = app.getHttpServer().address();
  if (address === null || typeof address === "string") {
    throw new Error("no ephemeral port");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await testDb?.stop();
});

describe("GET /v1/health", () => {
  it("reports liveness and database reachability", async () => {
    const res = await fetch(`${baseUrl}/v1/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { status: string; checks: { database: string }; service: string };
    expect(body).toEqual({ status: "ok", checks: { database: "up" }, service: "api" });
  });

  it("returns 503 with the same health shape when the database is unreachable", async () => {
    const brokenPool: Pick<PoolType, "query"> = {
      query: async () => {
        throw new Error("connection refused");
      },
    };
    const nest = await bootApp(testEnv("postgres://invalid"), brokenPool);
    try {
      const address = nest.getHttpServer().address() as { port: number };
      const res = await fetch(`http://127.0.0.1:${address.port}/v1/health`);
      expect(res.status).toBe(503);
      const body = (await res.json()) as { status: string; checks: { database: string } };
      expect(body.status).toBe("error");
      expect(body.checks.database).toBe("down");
    } finally {
      await nest.close();
    }
  });
});

describe("GET /v1/openapi.json", () => {
  it("serves the generated OpenAPI document", async () => {
    const res = await fetch(`${baseUrl}/v1/openapi.json`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown>; info: { title: string } };
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.title).toBe("myform API");
    expect(Object.keys(doc.paths)).toContain("/v1/health");
  });
});

describe("Problem Details filter", () => {
  it("renders unknown routes as RFC 9457 problem bodies", async () => {
    const res = await fetch(`${baseUrl}/v1/definitely-not-a-route`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as {
      type: string;
      title: string;
      status: number;
      code: string;
      detail: string;
    };
    expect(body.code).toBe("not_found");
    expect(body.status).toBe(404);
    expect(body.type).toContain("/not-found");
    expect(body.detail).toBe("This page could not be found.");
    expect(JSON.stringify(body)).not.toMatch(/stack|at /i);
  });

  it("renders malformed JSON as 400 bad_request without leaking internals", async () => {
    const res = await fetch(`${baseUrl}/v1/health`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; status: number; detail: string };
    expect(body.code).toBe("bad_request");
    expect(body.status).toBe(400);
    expect(body.detail).not.toContain("Unexpected token");
  });
});
