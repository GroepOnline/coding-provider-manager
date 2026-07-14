import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Soft start: no hard gates until the suite has a stable baseline.
      thresholds: undefined,
    },
  },
});
