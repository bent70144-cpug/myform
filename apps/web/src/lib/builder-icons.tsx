/**
 * Tiny inline SVG glyphs for the builder's block kinds (ticket 08 chrome).
 *
 * Rules kept on purpose:
 * - 16×16, stroke-only, inheriting `currentColor` so a glyph reads correctly
 *   on any surface (buttons, headings, badges) with no color props.
 * - `aria-hidden` + `focusable="false"`: icons are decoration and ALWAYS sit
 *   next to a real text label (e.g. "Add welcome block").
 * - Explicit React namespace import: the web tsconfig uses `jsx: "preserve"`
 *   (Next/SWC compiles it with the automatic runtime) while the vitest/esbuild
 *   pipeline falls back to the classic transform; importing React keeps BOTH
 *   compilers pointing at the same element factory without source pragmas.
 */
import * as React from "react";

/** The four M0 block kinds (mirrors FormBlock["kind"] in @form/contracts). */
export type BlockKind = "welcome" | "short_text" | "long_text" | "ending";

/** Pure presentational glyph — no hooks, no state. */
export function BlockIcon({ kind }: { kind: BlockKind }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {kind === "welcome" ? (
        <>
          {/* Flag: pole + swallow-tail banner. */}
          <path d="M4 2.5v11" />
          <path d="M4 3.5h7.5L9.7 6l1.8 2.5H4z" />
        </>
      ) : kind === "short_text" ? (
        <>
          {/* Two short lines — a single short answer. */}
          <path d="M3 6h10" />
          <path d="M3 10h6" />
        </>
      ) : kind === "long_text" ? (
        <>
          {/* Three lines, last one wrapping short. */}
          <path d="M3 4.5h10" />
          <path d="M3 8h10" />
          <path d="M3 11.5h6" />
        </>
      ) : (
        <>
          {/* Circled check — the form's end. */}
          <circle cx="8" cy="8" r="5.5" />
          <path d="M5.8 8.2l1.5 1.5 3-3.4" />
        </>
      )}
    </svg>
  );
}
