import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  base: "/admin/",
  plugins: [vue()],
  build: {
    outDir: "../public/admin",
    emptyOutDir: true,
    sourcemap: false
  }
});
