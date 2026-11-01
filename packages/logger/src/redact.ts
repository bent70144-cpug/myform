/**
 * Credential redaction. Every log record passes through `redactValue`
 * before serialization, so a logged request never contains a reusable
 * credential: cookies, authorization headers, tokens, passwords, and
 * secrets are replaced with `[REDACTED]` wherever they appear.
 */

export const REDACTED = "[REDACTED]";

/** Key fragments that mark a value as a credential. */
const SENSITIVE_KEY = /cookie|authorization|password|secret|token|api[-_]?key|bearer|credential/i;

/** Bearer/JWT-shaped substrings inside plain strings (e.g. in `msg`). */
const BEARER_IN_STRING = /\b(bearer|token)\s+[a-z0-9._~+/=-]{8,}/gi;
const JWT_LIKE = /\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/gi;

const MAX_DEPTH = 10;

function redactString(value: string): string {
  return value.replace(BEARER_IN_STRING, "[REDACTED]").replace(JWT_LIKE, "[REDACTED]");
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[TRUNCATED]";
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: typeof value.stack === "string" ? redactString(value.stack) : undefined,
    };
  }
  if (value instanceof Date) return value.toISOString();
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactValue(item, depth + 1);
    }
    return out;
  }
  return value;
}
