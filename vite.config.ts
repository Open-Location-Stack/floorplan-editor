import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: "esnext",
    modulePreload: {
      polyfill: false,
    },
  },
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    exclude: ["e2e/**", "node_modules/**", "dist/**", "coverage/**"],
    coverage: {
      reporter: ["text", "html"],
      include: [
        "src/lib/**/*.ts",
        "src/features/**/*.ts",
        "src/components/**/*.tsx",
        "src/App.tsx",
      ],
    },
  },
});
