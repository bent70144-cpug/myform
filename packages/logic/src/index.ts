/**
 * Logic engine package boundary (spec: "A logic package will own the pure
 * visibility/jump/variable engine. M0 creates the package boundary but
 * implements no rules.").
 *
 * M0 forms carry no logic rules, so the correct evaluation result is
 * "nothing is hidden". When M1/M2 introduces branching, the real engine
 * implements this same contract and this file becomes the seam.
 */

export interface LogicEvaluation {
  /** Blocks the respondent must not see; answers to them are discarded. */
  hiddenBlockIds: ReadonlySet<string>;
}

export interface LogicInput {
  /** Structural logic rules from the pinned schema (empty in M0). */
  rules: ReadonlyArray<{ type: string }>;
  /** Current raw answers keyed by block ID. */
  answers: Readonly<Record<string, unknown>>;
}

export function evaluateLogic(input: LogicInput): LogicEvaluation {
  void input;
  return { hiddenBlockIds: new Set<string>() };
}
