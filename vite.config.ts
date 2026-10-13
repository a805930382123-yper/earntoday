import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
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
