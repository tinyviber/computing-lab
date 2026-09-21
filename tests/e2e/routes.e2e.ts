import { expect, test, type Page } from "@playwright/test";

function collectFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const url = message.location()?.url ?? "";
    if (new URL(url, "http://localhost").pathname.startsWith("/api/")) return;
    failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  return failures;
}

test("serves the root app, calculator entry, and not-found fallback", async ({ page }) => {
  const failures = collectFailures(page);

  const root = await page.goto(".", { waitUntil: "networkidle" });
  expect(root?.status()).toBe(200);
  await expect(page.locator("h1").first()).toHaveText(/计算实验室/);

  const calculator = await page.goto("labs/calculator", { waitUntil: "networkidle" });
  expect(calculator?.status()).toBe(200);
  await expect(page.locator("h1").first()).toHaveText("登录");

  const missing = await page.goto("missing-route", { waitUntil: "networkidle" });
  expect(missing?.status()).toBe(200);
  await expect(page.locator("h1").first()).toHaveText(/实验不存在/);

  expect(failures, failures.join("\n")).toEqual([]);
});
