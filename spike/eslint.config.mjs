import { base } from "@myform/config/eslint";

export default [
  ...base,
  {
    ignores: ["dist/**", "webapp/.next/**", "webapp/next-env.d.ts", "artifacts/**"],
  },
];
