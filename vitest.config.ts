import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["ai/*/test/**/*.test.ts", "backend/*/test/**/*.test.ts"]
  }
});
