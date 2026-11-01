import { z } from "zod";
import { apiEnvSchema, loadEnv } from "@myform/config";

/**
 * Spike API environment. The spike's NestJS app mirrors the real API's
 * environment posture (`apiEnvSchema` from @myform/config) plus the Better
 * Auth secret the real API will own after ticket 03. Parsed with the same
 * strict Zod loader, so a missing or invalid value fails startup.
 */
export const spikeApiEnvSchema = apiEnvSchema.extend({
  BETTER_AUTH_SECRET: z.string().min(1),
});

export type SpikeApiEnv = z.output<typeof spikeApiEnvSchema>;

/** Keep only the named keys from a raw environment, dropping undefined. */
function pickEnvByKeys(
  keys: readonly string[],
  source: Record<string, string | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export function readSpikeApiEnv(
  source: Record<string, string | undefined> = process.env,
): SpikeApiEnv {
  return loadEnv(
    spikeApiEnvSchema,
    pickEnvByKeys(Object.keys(spikeApiEnvSchema.shape), source),
  );
}
