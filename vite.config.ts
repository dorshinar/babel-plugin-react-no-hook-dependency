/// <reference types="vitest" />

import { defineConfig } from "vite";
import { readFileSync } from "fs";

const packageJson = JSON.parse(
  readFileSync("./package.json", { encoding: "utf-8" })
);

export default defineConfig({
  build: {
    lib: {
      name: packageJson.name,
      entry: "./src/index.ts",
      fileName: (format) => `index.${format}.js`,
    },
    sourcemap: true,
  },
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/examples/**",
    ],
  },
});
