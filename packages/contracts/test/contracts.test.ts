import { describe, expect, it } from "vitest";
import {
  PROBLEM_CODES,
  PROBLEM_TYPE_BASE,
  buildOpenApiDocument,
  isProblemDetails,
  problem,
} from "../src";
import { healthResponse } from "../src/schemas";

describe("problem()", () => {
  it("maps a stable code to status, title, and RFC 9457 type URI", () => {
    const body = problem("validation_failed", {
      detail: "answers.block_1 is required",
      errors: [{ path: "answers.block_1", code: "required", message: "This field is required." }],
    });
    expect(body).toEqual({
      type: `${PROBLEM_TYPE_BASE}/validation-failed`,
      title: "Validation failed",
      status: 422,
      code: "validation_failed",
      detail: "answers.block_1 is required",
      errors: [{ path: "answers.block_1", code: "required", message: "This field is required." }],
    });
  });

  it("keeps every documented status convention", () => {
    expect(PROBLEM_CODES.bad_request.status).toBe(400);
    expect(PROBLEM_CODES.unauthorized.status).toBe(401);
    expect(PROBLEM_CODES.forbidden.status).toBe(403);
    expect(PROBLEM_CODES.email_unverified.status).toBe(403);
    expect(PROBLEM_CODES.not_found.status).toBe(404);
    expect(PROBLEM_CODES.draft_conflict.status).toBe(409);
    expect(PROBLEM_CODES.form_full.status).toBe(409);
    expect(PROBLEM_CODES.validation_failed.status).toBe(422);
    expect(PROBLEM_CODES.rate_limited.status).toBe(429);
    expect(PROBLEM_CODES.internal_error.status).toBe(500);
  });

  it("omits empty detail and errors fields", () => {
    const body = problem("not_found");
    expect(Object.keys(body).sort()).toEqual(["code", "status", "title", "type"]);
  });

  it("isProblemDetails narrows only valid bodies", () => {
    expect(isProblemDetails(problem("rate_limited"))).toBe(true);
    expect(isProblemDetails({ type: "https://evil.example/x", title: "t", status: 400, code: "bad_request" })).toBe(
      false,
    );
    expect(isProblemDetails(null)).toBe(false);
  });
});

describe("healthResponse contract", () => {
  it("reports ok with database up", () => {
    const { ok, body } = healthResponse({ database: "up", service: "api" });
    expect(ok).toBe(true);
    expect(body).toEqual({ status: "ok", checks: { database: "up" }, service: "api" });
  });

  it("reports error (503 body shape) with database down", () => {
    const { ok, body } = healthResponse({ database: "down", service: "api" });
    expect(ok).toBe(false);
    expect(body.status).toBe("error");
    expect(body.checks.database).toBe("down");
  });
});

describe("buildOpenApiDocument", () => {
  const doc = buildOpenApiDocument({ servers: [{ url: "http://127.0.0.1:4000" }] });

  it("is an OpenAPI 3.1 document with the health path", () => {
    expect(doc["openapi"]).toBe("3.1.0");
    expect(doc).toHaveProperty(["paths", "/v1/health", "get", "responses", "200"]);
    expect(doc).toHaveProperty(["paths", "/v1/openapi.json", "get"]);
    expect(doc).toHaveProperty(["components", "schemas", "ProblemDetails"]);
  });

  it("matches the committed snapshot", () => {
    expect(doc).toMatchSnapshot();
  });
});
