import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { babel } from "@rollup/plugin-babel";
import { addHooksDeps } from "babel-plugin-react-no-hook-dependency";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({
      // presets: ["@babel/preset-env"],
      sourceType: "module",
      plugins: [addHooksDeps],
    }),
  ],
});
