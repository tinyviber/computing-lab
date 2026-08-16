import { defineConfig } from "@playwright/test";

const port = 4175;

function normalizeBasePath(value: string | undefined): string {
  const raw = value?.trim() || "/";
  if (raw === "/") return "";
  return `/${raw.replace(/^\/+|\/+$/g, "")}`;
}

const basePath = normalizeBasePath(process.env.VITE_BASE_PATH ?? process.env.BASE_PATH);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.(spec|e2e)\.ts/,
  timeout: 15_000,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}${basePath}/`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `bun run scripts/serve-preview.mjs`,
    url: `http://127.0.0.1:${port}${basePath}/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
