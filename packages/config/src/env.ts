import { z } from "zod";

/**
 * Error thrown when the environment fails validation. Applications must call
 * `loadEnv` at startup so the process fails fast on missing/invalid values.
 */
export class EnvValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

export type EnvSource = Record<string, string | undefined>;

/**
 * Parse `source` (default `process.env`) against a Zod object schema.
 * Throws {@link EnvValidationError} listing every problem — never a partial
 * config. Values must already be strings, as real environments are.
 */
export function loadEnv<S extends z.ZodType>(
  schema: S,
  source: EnvSource = process.env as EnvSource,
): z.output<S> {
  const result = schema.safeParse(source as z.input<S>);
  if (!result.success) {
    throw new EnvValidationError(
      z.prettifyError(result.error)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    );
  }
  return result.data as z.output<S>;
}
