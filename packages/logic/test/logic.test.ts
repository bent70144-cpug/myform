import { describe, expect, it } from "vitest";
import { evaluateLogic } from "../src";

describe("evaluateLogic (M0 boundary stub)", () => {
  it("hides nothing when there are no rules", () => {
    const result = evaluateLogic({ rules: [], answers: {} });
    expect(result.hiddenBlockIds.size).toBe(0);
  });

  it("stays a pure function", () => {
    const a = evaluateLogic({ rules: [{ type: "jump" }], answers: { b1: "x" } });
    const b = evaluateLogic({ rules: [{ type: "jump" }], answers: { b1: "x" } });
    expect(a.hiddenBlockIds).toEqual(b.hiddenBlockIds);
  });
});
