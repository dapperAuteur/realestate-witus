import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    setupFiles: ["./vitest.setup.ts"],
    // Integration tests round-trip to Neon.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // The integration suites share one Neon database; parallel workers
    // contend for connections and time each other out. Unit files are fast
    // enough that serial execution costs little.
    fileParallelism: false,
    exclude: ["**/node_modules/**", "tests/e2e/**"],
  },
});
