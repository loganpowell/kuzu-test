import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "dist/", "**/*.test.ts"],
    },
  },
  resolve: {
    alias: {
      "cloudflare:workers": path.resolve(
        __dirname,
        "./src/__mocks__/cloudflare-workers.ts"
      ),
    },
  },
});
