import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    // Match the `~` alias from astro.config / tsconfig so test imports
    // can use the same `~/lib/...` paths as the app code.
    alias: { "~": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Setup runs before any test module loads — required because
    // `src/lib/config.ts` reads `APP_PASSWORD` at import time and would
    // throw without it.
    setupFiles: ["./tests/setup.ts"],
    // Each test file gets its own isolated process so rate-limit's
    // module-level Map state doesn't bleed between suites.
    isolate: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts", "src/components/lightbox/develop-params.ts"],
      exclude: ["src/lib/db/**", "src/lib/*video*.ts"],
    },
  },
});
