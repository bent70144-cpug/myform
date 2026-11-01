import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 90_000,
    hookTimeout: 180_000,
    // Several suites boot their own embedded Postgres / real Next+Nest
    // children; keep files isolated so ports and datadirs never collide.
    fileParallelism: false,
  },
});
