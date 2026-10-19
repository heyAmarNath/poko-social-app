import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  // SP_STATE_DIR points local D1/R2 at a separate folder, e.g. for throwaway test data.
  plugins: [react(), tailwindcss(), cloudflare({ persistState: process.env.SP_STATE_DIR ? { path: process.env.SP_STATE_DIR } : true })],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./web/src", import.meta.url)) },
  },
});
