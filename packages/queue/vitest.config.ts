import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Boots its own embedded Postgres; keep files isolated.
    fileParallelism: false,
  },
});
