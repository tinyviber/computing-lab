import { expect, test } from "@playwright/test";

test("traces acknowledgment loss, timeout, retry, and duplicate suppression", async ({ page }) => {
  await page.goto("labs/protocol-process?scenario=ack-loss", { waitUntil: "networkidle" });

  await expect(page.getByRole("main", { name: "Protocol Process workspace" })).toBeVisible();
  await page.getByRole("combobox", { name: /your prediction/i }).selectOption("delivered");
  await page.getByRole("button", { name: "Record prediction" }).click();
  await page.getByRole("button", { name: "Run to completion" }).click();

  await page.getByRole("button", { name: "Inspect first fault" }).click();
  await expect(page.getByRole("region", { name: /selected event evidence/i })).toContainText(
    /tick 5.*dropped/i,
  );
  await page.getByRole("button", { name: "Inspect retry" }).click();
  await expect(page.getByRole("region", { name: /selected event evidence/i })).toContainText(
    /retry attempt 2/i,
  );
  await expect(page.getByRole("region", { name: /final protocol result/i })).toContainText(
    /status: delivered.*attempts: 2.*duplicates suppressed: 1/i,
  );

  const finalFrame = page.getByRole("button", { name: /Frame 9, tick 10, deliver-ack/i });
  await finalFrame.focus();
  await page.keyboard.press("Enter");
  await expect(finalFrame).toHaveAttribute("aria-current", "true");
});

test.describe("responsive evidence", () => {
  test.use({ viewport: { width: 520, height: 900 } });

  test("keeps queue and status evidence usable on a narrow viewport", async ({ page }) => {
    await page.goto("labs/protocol-process?scenario=no-loss", { waitUntil: "networkidle" });

    await expect(page.getByRole("main", { name: "Protocol Process workspace" })).toBeVisible();
    await page.getByRole("button", { name: "Step" }).click();
    await expect(page.getByRole("table", { name: /protocol counters/i })).toBeVisible();
    await expect(page.getByRole("region", { name: /final protocol result/i })).toBeVisible();
  });
});
