import { base } from "@myform/config/eslint";

/**
 * Web boundary rules (spec: "Engineering guardrails"). The web build and
 * lint FAIL if the web app imports the database package or the server
 * auth entrypoint. `test/boundaries.test.ts` asserts these rules actually
 * fire, so the guard cannot silently rot.
 */
export default [
  ...base,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@myform/db", "@myform/db/**"],
              message:
                "The web app never imports the database package: the API owns all database access.",
            },
            {
              group: ["@myform/auth/server", "@myform/auth/server/**"],
              message:
                "The web app never imports the server auth entrypoint; use the client entry '@myform/auth'.",
            },
          ],
        },
      ],
    },
  },
];
