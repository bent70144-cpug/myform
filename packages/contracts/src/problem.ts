/**
 * Stable API error codes (spec: "API conventions"). Each code maps to a
 * fixed HTTP status and title; bodies are RFC 9457 Problem Details. Codes
 * are part of the public contract and must never change meaning.
 */

export const PROBLEM_TYPE_BASE = "https://form.example/errors";

export interface ProblemCodeDefinition {
  status: number;
  title: string;
}

export const PROBLEM_CODES = {
  bad_request: { status: 400, title: "Bad request" },
  unauthorized: { status: 401, title: "Unauthenticated" },
  invalid_session: { status: 401, title: "Invalid session" },
  forbidden: { status: 403, title: "Forbidden" },
  email_unverified: { status: 403, title: "Email not verified" },
  origin_mismatch: { status: 403, title: "Origin mismatch" },
  not_found: { status: 404, title: "Not found" },
  conflict: { status: 409, title: "Conflict" },
  draft_conflict: { status: 409, title: "Draft version conflict" },
  form_full: { status: 409, title: "Form submission cap reached" },
  validation_failed: { status: 422, title: "Validation failed" },
  invalid_character: { status: 422, title: "Invalid character" },
  schema_too_large: { status: 422, title: "Schema too large" },
  submission_too_large: { status: 422, title: "Submission too large" },
  rate_limited: { status: 429, title: "Rate limited" },
  internal_error: { status: 500, title: "Internal error" },
} as const satisfies Record<string, ProblemCodeDefinition>;

export type ProblemCode = keyof typeof PROBLEM_CODES;

/** Optional field-level errors carried inside a Problem Details body. */
export interface FieldError {
  path?: string;
  code: string;
  message: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
  detail?: string;
  errors?: FieldError[];
}

export function problemType(code: ProblemCode): string {
  return `${PROBLEM_TYPE_BASE}/${code.replace(/_/g, "-")}`;
}

export interface ProblemOptions {
  detail?: string;
  errors?: FieldError[];
  /** Override the mapped status (rare; code→status is otherwise fixed). */
  status?: number;
}

/** Build an RFC 9457 Problem Details object for a stable code. */
export function problem(code: ProblemCode, options: ProblemOptions = {}): ProblemDetails {
  const definition: ProblemCodeDefinition = PROBLEM_CODES[code];
  const body: ProblemDetails = {
    type: problemType(code),
    title: definition.title,
    status: options.status ?? definition.status,
    code,
  };
  if (options.detail !== undefined) body.detail = options.detail;
  if (options.errors !== undefined) body.errors = options.errors;
  return body;
}

/** Narrow an unknown error body into Problem Details. */
export function isProblemDetails(value: unknown): value is ProblemDetails {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.type === "string" &&
    candidate.type.startsWith(PROBLEM_TYPE_BASE) &&
    typeof candidate.title === "string" &&
    typeof candidate.status === "number" &&
    typeof candidate.code === "string" &&
    candidate.code in PROBLEM_CODES
  );
}
