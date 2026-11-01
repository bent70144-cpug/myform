import { z } from "zod";

/**
 * Shared request/response contracts. Every API response body the spec
 * defines is described here once and reused by the OpenAPI document and
 * the controllers.
 */

export const healthStatusSchema = z.enum(["ok", "error"]);
export type HealthStatus = z.output<typeof healthStatusSchema>;

export const componentStatusSchema = z.enum(["up", "down"]);
export type ComponentStatus = z.output<typeof componentStatusSchema>;

/** `GET /v1/health` — liveness plus database reachability, no tenant data. */
export const healthResponseSchema = z.object({
  status: healthStatusSchema,
  checks: z.object({ database: componentStatusSchema }),
  service: z.string(),
});
export type HealthResponse = z.output<typeof healthResponseSchema>;

export function healthResponse(input: {
  database: ComponentStatus;
  service: string;
}): { body: HealthResponse; ok: boolean } {
  const ok = input.database === "up";
  return {
    ok,
    body: {
      status: ok ? "ok" : "error",
      checks: { database: input.database },
      service: input.service,
    },
  };
}

export const serviceInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
});
export type ServiceInfo = z.output<typeof serviceInfoSchema>;
