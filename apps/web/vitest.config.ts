import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // Boots an embedded Postgres and child servers; keep files isolated.
    fileParallelism: false,
  },
});
