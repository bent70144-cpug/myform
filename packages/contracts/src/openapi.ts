import { createDocument } from "zod-openapi";
import { z } from "zod";
import { PROBLEM_CODES, problemType } from "./problem";
import { healthResponseSchema } from "./schemas";

export const API_TITLE = "myform API";
export const API_VERSION = "0.1.0";

/** Every error response uses the same RFC 9457 Problem Details media type. */
export const PROBLEM_CONTENT_TYPE = "application/problem+json";

const problemDetailsSchema = z.object({
  type: z.string().meta({ description: "Problem type URI", example: problemType("validation_failed") }),
  title: z.string(),
  status: z.number().int(),
  code: z.enum(Object.keys(PROBLEM_CODES) as [string, ...string[]]),
  detail: z.string().optional(),
  errors: z
    .array(
      z.object({
        path: z.string().optional(),
        code: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
});

export interface OpenApiOptions {
  servers?: Array<{ url: string; description?: string }>;
}

const problemResponse = (description: string) => ({
  description,
  content: { [PROBLEM_CONTENT_TYPE]: { schema: problemDetailsSchema } },
});

/**
 * Build the OpenAPI 3.1 document from the shared Zod contracts. Served at
 * `/v1/openapi.json` and covered by a snapshot test.
 */
export function buildOpenApiDocument(options: OpenApiOptions = {}): Record<string, unknown> {
  const document = createDocument({
    openapi: "3.1.0",
    info: {
      title: API_TITLE,
      version: API_VERSION,
      description: "Conversational form platform API (M0)",
    },
    servers: options.servers ?? [{ url: "http://127.0.0.1:4000", description: "Local API" }],
    tags: [{ name: "Operations" }],
    paths: {
      "/v1/health": {
        get: {
          summary: "Liveness and database reachability",
          tags: ["Operations"],
          responses: {
            "200": {
              description: "Service is live and the database is reachable",
              content: { "application/json": { schema: healthResponseSchema } },
            },
            "503": {
              description: "Service is live but the database is unreachable",
              content: { "application/json": { schema: healthResponseSchema } },
            },
          },
        },
      },
      "/v1/openapi.json": {
        get: {
          summary: "This document",
          tags: ["Operations"],
          responses: {
            "200": { description: "OpenAPI document" },
            "500": problemResponse("Internal error"),
          },
        },
      },
    },
    components: {
      schemas: { ProblemDetails: problemDetailsSchema },
    },
  });
  return document as unknown as Record<string, unknown>;
}
