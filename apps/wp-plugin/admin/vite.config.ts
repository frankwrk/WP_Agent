import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: "src/main.tsx",
      output: {
        entryFileNames: "wp-agent-admin.js",
        assetFileNames: (assetInfo) => {
          if ((assetInfo.name ?? "").endsWith(".css")) {
            return "wp-agent-admin.css";
          }

          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
});
