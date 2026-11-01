import { z } from "zod";

/**
 * Stable error codes produced by schema validation. The API maps these onto
 * Problem Details responses verbatim; they are part of the public contract.
 */
export const SCHEMA_ERROR_CODES = [
  "validation_failed",
  "invalid_character",
  "schema_too_large",
] as const;

export type SchemaErrorCode = (typeof SCHEMA_ERROR_CODES)[number];

/** A single validation issue with a stable, machine-readable code. */
export interface SchemaIssue {
  /** Dot path into the submitted value, e.g. `blocks.3.label`. */
  path: string;
  code: SchemaErrorCode;
  /** i18n-ready detail; not for public bodies. */
  message: string;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: SchemaIssue[] };

// --- Limits (spec: "Form schema and versioning") -------------------------

export const LIMITS = {
  formTitleChars: 200,
  blockLabelChars: 500,
  descriptionChars: 2_000,
  placeholderChars: 200,
  shortTextAnswerChars: 1_000,
  longTextAnswerChars: 10_000,
  draftSchemaBytes: 256 * 1024,
  submissionPayloadBytes: 100 * 1024,
  maxBlocks: 200,
  maxLogicRules: 50,
  maxJumps: 20,
} as const;

export const BLOCK_ID_PATTERN = /^[A-Za-z0-9_-]{10,32}$/;

// NUL cannot be stored in Postgres JSONB; reject it everywhere text enters.
export function containsNul(value: string): boolean {
  return value.includes("\u0000");
}

// --- Blocks ---------------------------------------------------------------

const blockId = z
  .string()
  .regex(BLOCK_ID_PATTERN, { message: "block id must match ^[A-Za-z0-9_-]{10,32}$" });

const plainText = (max: number) =>
  z.string().max(max).refine((v) => !containsNul(v), { message: "NUL character is not allowed" });

const optionalText = (max: number) =>
  plainText(max)
    .optional()
    .or(z.literal("").transform(() => undefined));

export const welcomeBlockSchema = z.object({
  id: blockId,
  kind: z.literal("welcome"),
  title: plainText(LIMITS.blockLabelChars).refine((v) => v.trim().length > 0, {
    message: "title must not be empty",
  }),
  description: optionalText(LIMITS.descriptionChars),
});

export const shortTextBlockSchema = z.object({
  id: blockId,
  kind: z.literal("short_text"),
  label: plainText(LIMITS.blockLabelChars).refine((v) => v.trim().length > 0, {
    message: "label must not be empty",
  }),
  description: optionalText(LIMITS.descriptionChars),
  required: z.boolean(),
  placeholder: optionalText(LIMITS.placeholderChars),
});

export const longTextBlockSchema = z.object({
  id: blockId,
  kind: z.literal("long_text"),
  label: plainText(LIMITS.blockLabelChars).refine((v) => v.trim().length > 0, {
    message: "label must not be empty",
  }),
  description: optionalText(LIMITS.descriptionChars),
  required: z.boolean(),
  placeholder: optionalText(LIMITS.placeholderChars),
});

export const endingBlockSchema = z.object({
  id: blockId,
  kind: z.literal("ending"),
  title: plainText(LIMITS.blockLabelChars).refine((v) => v.trim().length > 0, {
    message: "title must not be empty",
  }),
  description: optionalText(LIMITS.descriptionChars),
});

export const blockSchema = z.discriminatedUnion("kind", [
  welcomeBlockSchema,
  shortTextBlockSchema,
  longTextBlockSchema,
  endingBlockSchema,
]);

export type Block = z.output<typeof blockSchema>;
export type QuestionBlock = Extract<Block, { kind: "short_text" | "long_text" }>;

export const isQuestionBlock = (block: Block): block is QuestionBlock =>
  block.kind === "short_text" || block.kind === "long_text";

// --- Envelope -------------------------------------------------------------

export const formSettingsSchema = z
  .object({
    /** Reserved for later milestones; unknown settings keys are rejected. */
    submissionCap: z.number().int().min(1).max(1_000_000).optional(),
  })
  .strict();

export type FormSettings = z.output<typeof formSettingsSchema>;

export const defaultSettings: FormSettings = {};

export const themeSchema = z.object({ preset: z.literal("default") });
export type Theme = z.output<typeof themeSchema>;
export const defaultTheme: Theme = { preset: "default" };

/**
 * Structural placeholder for logic rules. M0 has no logic; the shape is
 * reserved so the envelope does not change when branching arrives.
 */
export const logicRuleSchema = z.object({ type: z.string() }).passthrough();
export type LogicRule = z.output<typeof logicRuleSchema>;

export const formSchemaSchema = z.object({
  schemaVersion: z.literal(1),
  title: plainText(LIMITS.formTitleChars),
  blocks: z.array(blockSchema).max(LIMITS.maxBlocks),
  logic: z.array(logicRuleSchema).max(LIMITS.maxLogicRules),
  theme: themeSchema,
  settings: formSettingsSchema,
});

export type FormSchema = z.output<typeof formSchemaSchema>;

/** The empty draft is exactly this object (spec-mandated shape). */
export function emptyDraft(): FormSchema {
  return {
    schemaVersion: 1,
    title: "",
    blocks: [],
    logic: [],
    theme: { preset: "default" },
    settings: {},
  };
}

// --- Byte caps -------------------------------------------------------------

export function byteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

export function isWithinDraftCap(value: unknown): boolean {
  return byteSize(value) <= LIMITS.draftSchemaBytes;
}

export function isWithinSubmissionCap(value: unknown): boolean {
  return byteSize(value) <= LIMITS.submissionPayloadBytes;
}

// --- Parsing ---------------------------------------------------------------

function zodPath(path: PropertyKey[]): string {
  return path.map(String).join(".") || "(root)";
}

/**
 * Parse an unknown JSON value into a {@link FormSchema}. NUL characters and
 * oversize values surface as stable codes (`invalid_character`,
 * `schema_too_large`), not raw Zod errors.
 */
export function parseFormSchema(value: unknown): ParseResult<FormSchema> {
  if (!isWithinDraftCap(value)) {
    return { ok: false, issues: [{ path: "(root)", code: "schema_too_large", message: "draft schema exceeds 256 KB" }] };
  }
  const result = formSchemaSchema.safeParse(value);
  if (result.success) return { ok: true, value: result.data };
  const issues: SchemaIssue[] = result.error.issues.map((issue) => ({
    path: zodPath(issue.path),
    code: issue.message.includes("NUL") ? "invalid_character" : "validation_failed",
    message: issue.message,
  }));
  return { ok: false, issues };
}
