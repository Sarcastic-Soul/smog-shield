import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const mock = (name: string) => fileURLToPath(new URL(`./tests/mocks/${name}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": mock("empty.ts"),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/components/**"],
      reporter: ["text", "html"],
      thresholds: { lines: 85, branches: 75, functions: 80, statements: 85 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          exclude: ["tests/unit/components/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          include: ["tests/unit/components/**/*.test.tsx"],
          setupFiles: ["tests/setup/dom.ts"],
        },
      },
    ],
  },
});
