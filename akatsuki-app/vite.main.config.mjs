import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      external: ["electron", "better-sqlite3", "path", "fs", "os", "crypto", "https", "http"],
    },
  },
});
