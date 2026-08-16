import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const cwd = fileURLToPath(new URL(".", import.meta.url));
  const env = loadEnv(mode, cwd, "");
  const configuredBase = env.VITE_BASE_PATH ?? env.BASE_PATH ?? "/";
  const base = configuredBase.endsWith("/") ? configuredBase : `${configuredBase}/`;

  return {
    appType: "spa",
    base,
    plugins: [react(), tailwindcss()],
  };
});
