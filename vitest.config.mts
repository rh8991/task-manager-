import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { testTimeout: 20000, hookTimeout: 30000, fileParallelism: false },
});
