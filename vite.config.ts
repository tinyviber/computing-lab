import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { basePathForVite } from "./src/shared/basePath.ts";

export default defineConfig(({ mode }) => {
  const cwd = fileURLToPath(new URL(".", import.meta.url));
  const env = loadEnv(mode, cwd, "");
  const base = basePathForVite(env.VITE_BASE_PATH ?? env.BASE_PATH ?? "/");

  return {
    appType: "spa",
    base,
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
      proxy: {
        "/api": {
          target: `http://localhost:${env.LAB_PORT ?? 8788}`,
          changeOrigin: true,
        },
      },
    },
  };
});
