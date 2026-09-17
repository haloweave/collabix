import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "tests/**/*.test.ts"],
    // Integration tests share one Postgres; run test files serially to keep
    // concurrency assertions deterministic.
    fileParallelism: false,
  },
});
