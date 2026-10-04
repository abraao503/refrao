import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // Exercise the real content-script lifecycle; WXT uses Vite's import.meta.env.
    server: { deps: { inline: ["wxt"] } },
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
