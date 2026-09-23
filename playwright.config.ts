import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { basePathPrefix } from "./src/shared/basePath.ts";

const port = 8788;

const basePath = basePathPrefix(process.env.VITE_BASE_PATH ?? process.env.BASE_PATH);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.(spec|e2e)\.ts/,
  workers: 2,
  timeout: 15_000,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}${basePath}/`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node server/db/seed.ts && node server/index.ts",
    url: `http://127.0.0.1:${port}/api/health`,
    env: {
      ...process.env,
      LAB_HOST: "127.0.0.1",
      LAB_PORT: String(port),
      LAB_DB_PATH: join(tmpdir(), `computing-lab-e2e-${process.pid}.db`),
    },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
