import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 90_000,
    hookTimeout: 90_000,
    // Each test file boots its own embedded Postgres; keep files isolated.
    fileParallelism: false,
  },
});
