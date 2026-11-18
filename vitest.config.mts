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
      "next/cache": mock("next-cache.ts"),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/app/api/**", "src/components/**"],
      reporter: ["text", "html"],
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
