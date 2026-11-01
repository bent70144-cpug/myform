import {
  LIMITS,
  type FormSchema,
  type ParseResult,
  type SchemaIssue,
  isQuestionBlock,
  parseFormSchema,
} from "./form-schema";

/**
 * Publish-time validation (spec: "Form schema and versioning"). Checks the
 * structural invariants beyond the per-block schema: unique block IDs, at
 * least one question block, at most one welcome and one ending, a welcome
 * block first if present, and an ending block last if present.
 */
export function validateForPublish(value: unknown): ParseResult<FormSchema> {
  const parsed = parseFormSchema(value);
  if (!parsed.ok) return parsed;
  const schema = parsed.value;

  const issues: SchemaIssue[] = [];
  const blocks = schema.blocks;

  const seen = new Set<string>();
  for (const [index, block] of blocks.entries()) {
    if (seen.has(block.id)) {
      issues.push({ path: `blocks.${index}.id`, code: "validation_failed", message: `duplicate block id: ${block.id}` });
    }
    seen.add(block.id);
  }

  const welcomes = blocks.filter((b) => b.kind === "welcome");
  const endings = blocks.filter((b) => b.kind === "ending");
  if (welcomes.length > 1) {
    issues.push({ path: "blocks", code: "validation_failed", message: "at most one welcome block is allowed" });
  }
  if (endings.length > 1) {
    issues.push({ path: "blocks", code: "validation_failed", message: "at most one ending block is allowed" });
  }
  if (blocks.length > 0 && welcomes.length > 0 && blocks[0]?.kind !== "welcome") {
    issues.push({ path: "blocks.0", code: "validation_failed", message: "the welcome block must come first" });
  }
  if (blocks.length > 0 && endings.length > 0 && blocks[blocks.length - 1]?.kind !== "ending") {
    issues.push({
      path: `blocks.${blocks.length - 1}`,
      code: "validation_failed",
      message: "the ending block must come last",
    });
  }
  if (!blocks.some(isQuestionBlock)) {
    issues.push({ path: "blocks", code: "validation_failed", message: "at least one question block is required" });
  }
  if (schema.logic.length > LIMITS.maxLogicRules) {
    issues.push({ path: "logic", code: "validation_failed", message: "too many logic rules" });
  }

  if (issues.length > 0) return { ok: false, issues };
  return parsed;
}
