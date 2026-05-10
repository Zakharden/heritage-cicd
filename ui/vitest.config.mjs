import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    reporters: ["default", "junit"],
    outputFile: {
      junit: "./test-results/junit.xml",
    },
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "cobertura", "json-summary"],
      reportsDirectory: "coverage",
      include: ["src/**/*.js"],
    },
  },
});
