import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version) },
  plugins: [react()],
  clearScreen: false,
  server: {
    strictPort: true,
    watch: {
      // Cargo and the C# launcher compiler briefly lock generated Windows files.
      ignored: ["**/src-tauri/target/**", "**/CSC*.TMP"],
    },
  },
  build: {
    target: "es2021",
    minify: "esbuild",
  },
});
