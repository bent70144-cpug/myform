import { describe, expect, it } from "vitest";
import {
  LIMITS,
  type Block,
  emptyDraft,
  migrateSchema,
  parseFormSchema,
  validateForPublish,
} from "../src";
import { UnknownSchemaVersionError } from "../src/migrate";

function questionBlock(overrides: Partial<Block> = {}): Block {
  return { id: "q_short_text1", kind: "short_text", label: "Name", required: true, ...overrides };
}

describe("emptyDraft", () => {
  it("is exactly the spec-mandated object", () => {
    expect(emptyDraft()).toEqual({
      schemaVersion: 1,
      title: "",
      blocks: [],
      logic: [],
      theme: { preset: "default" },
      settings: {},
    });
  });

  it("does not share mutable state between calls", () => {
    const a = emptyDraft();
    const b = emptyDraft();
    expect(a).not.toBe(b);
    expect(a.blocks).not.toBe(b.blocks);
  });
});

describe("parseFormSchema", () => {
  it("accepts a minimal valid draft with one question", () => {
    const draft = { ...emptyDraft(), blocks: [questionBlock()] };
    const result = parseFormSchema(draft);
    expect(result.ok).toBe(true);
  });

  it("rejects unknown block kinds", () => {
    const result = parseFormSchema({
      ...emptyDraft(),
      blocks: [{ id: "q_weird_kind1", kind: "statement", label: "x", required: false }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects block ids outside ^[A-Za-z0-9_-]{10,32}$", () => {
    const result = parseFormSchema({ ...emptyDraft(), blocks: [questionBlock({ id: "short" })] });
    expect(result.ok).toBe(false);
  });

  it("rejects NUL characters with the stable invalid_character code", () => {
    const result = parseFormSchema({ ...emptyDraft(), blocks: [questionBlock({ label: "bad\u0000label" })] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.code)).toContain("invalid_character");
    }
  });

  it("rejects oversized drafts with schema_too_large", () => {
    const huge = { ...emptyDraft(), title: "x".repeat(LIMITS.draftSchemaBytes) };
    const result = parseFormSchema(huge);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.code)).toContain("schema_too_large");
    }
  });

  it("rejects drafts above the 200-block limit", () => {
    const blocks = Array.from({ length: LIMITS.maxBlocks + 1 }, (_, i) =>
      questionBlock({ id: `q_${String(i).padStart(10, "0")}` }),
    );
    const result = parseFormSchema({ ...emptyDraft(), blocks });
    expect(result.ok).toBe(false);
  });
});

describe("validateForPublish", () => {
  it("accepts welcome + question + ending in order", () => {
    const schema = {
      ...emptyDraft(),
      blocks: [
        { id: "welcome_blk1", kind: "welcome", title: "Hi" },
        questionBlock(),
        { id: "ending_blk_1", kind: "ending", title: "Bye" },
      ],
    };
    expect(validateForPublish(schema)).toEqual({ ok: true, value: expect.objectContaining({ schemaVersion: 1 }) });
  });

  it("requires at least one question block", () => {
    const result = validateForPublish({
      ...emptyDraft(),
      blocks: [{ id: "welcome_blk1", kind: "welcome", title: "Hi" }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a second welcome block", () => {
    const result = validateForPublish({
      ...emptyDraft(),
      blocks: [
        { id: "welcome_blk1", kind: "welcome", title: "Hi" },
        questionBlock(),
        { id: "welcome_blk2", kind: "welcome", title: "Again" },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an ending block that is not last", () => {
    const result = validateForPublish({
      ...emptyDraft(),
      blocks: [
        { id: "ending_blk_1", kind: "ending", title: "Bye" },
        questionBlock(),
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate block ids", () => {
    const result = validateForPublish({ ...emptyDraft(), blocks: [questionBlock(), questionBlock()] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.message.includes("duplicate block id"))).toBe(true);
    }
  });
});

describe("migrateSchema", () => {
  it("handles version 1 as identity", () => {
    const draft = { ...emptyDraft(), blocks: [questionBlock()] };
    expect(migrateSchema(draft)).toEqual(parseFormSchema(draft));
  });

  it("throws for unknown schema versions", () => {
    expect(() => migrateSchema({ schemaVersion: 99 })).toThrow(UnknownSchemaVersionError);
  });
});
