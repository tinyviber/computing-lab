import { expect, test } from "@playwright/test";

test("traces deterministic Monte Carlo convergence for pi", async ({ page }) => {
  await page.goto("labs/monte-carlo?scenario=small", { waitUntil: "networkidle" });

  await expect(page.getByRole("main", { name: "Monte Carlo π workspace" })).toBeVisible();
  await page.getByRole("combobox", { name: /final estimate relative to π/i }).selectOption("below");
  await page.getByRole("button", { name: "Record prediction" }).click();
  await page.getByRole("button", { name: "Run to end" }).click();

  await expect(page.locator('output[aria-label="Final Monte Carlo estimate"]')).toHaveText(/3\.08/);
  await expect(page.getByRole("region", { name: /final Monte Carlo result/i })).toContainText(
    /final error 0\.0616/i,
  );

  const batch2 = page.getByRole("button", { name: /Batch 2, 500 samples, 375 inside/i });
  await batch2.focus();
  await page.keyboard.press("Enter");
  await expect(batch2).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("table", { name: "Fixture comparison" })).toContainText(/3\.1448/);
});

test.describe("responsive evidence", () => {
  test.use({ viewport: { width: 520, height: 900 } });

  test("keeps convergence tables and status usable on a narrow viewport", async ({ page }) => {
    await page.goto("labs/monte-carlo?scenario=small", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Step" }).click();
    await expect(page.getByRole("table", { name: /convergence by batch/i })).toBeVisible();
    await expect(
      page.getByRole("region", { name: /selected Monte Carlo evidence/i }),
    ).toBeVisible();
  });
});
