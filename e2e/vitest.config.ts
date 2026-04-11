import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./src/setup.ts"],
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
});
