import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false, // integration tests share one Postgres DB — run test files serially
    hookTimeout: 20_000,
    testTimeout: 20_000,
  },
});
