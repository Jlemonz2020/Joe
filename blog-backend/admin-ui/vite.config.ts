import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/admin/",
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  build: {
    outDir: "../public/admin",
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/element-plus") || id.includes("node_modules/@element-plus")) return "element-plus";
          if (id.includes("node_modules/@codemirror") || id.includes("node_modules/codemirror")) return "codemirror";
          if (id.includes("node_modules")) return "vendor";
        }
      }
    }
  },
  server: {
    proxy: {
      "/admin/api": "http://127.0.0.1:8097"
    }
  }
});
