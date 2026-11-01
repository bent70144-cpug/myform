/**
 * Shared ESLint flat-config preset.
 * Consumed by every workspace package via `eslint.config.mjs`:
 *
 *   import { base } from "@myform/config/eslint";
 *   export default [...base];
 *
 * Kept as plain ESM source (no build step) so lint works before builds.
 */
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export const ignores = [
  "**/dist/**",
  "**/.next/**",
  "**/node_modules/**",
  "**/.turbo/**",
  "**/coverage/**",
  "**/.local/**",
  "**/tools/**",
];

export const base = tseslint.config(
  { ignores },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"],
    },
  },
);
