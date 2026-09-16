import { expect, test } from "@playwright/test";

test("renders the Excel lesson as a Slidev sub-app", async ({ page }) => {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));

  const response = await page.goto("slides/excel-01/", { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  await expect(page.locator(".slidev-page-1 h1")).toHaveText(/把空白表做成成绩表/);
  await expect(page.locator(".excel-sheet")).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".slidev-page-2 h1")).toHaveText(/成品长这样/);
  await expect(page.getByRole("img", { name: "Excel 成绩表成品" })).toBeVisible();
  expect(failures, failures.join("\n")).toEqual([]);
});

test("serves a Slidev deep link from the deck index and keeps unknown decks 404", async ({
  page,
}) => {
  const response = await page.goto("slides/excel-01/2", { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  await expect(page.locator(".slidev-page-2 h1")).toHaveText(/成品长这样/);

  const missing = await page.goto("slides/unknown/", { waitUntil: "domcontentloaded" });
  expect(missing?.status()).toBe(404);
});
