import { expect, test } from "@playwright/test";

test("explores a fixed-width two's-complement overflow trajectory", async ({ page }) => {
  await page.goto("labs/twos-complement?width=4&a=0111&b=0001&reading=signed", {
    waitUntil: "networkidle",
  });

  await expect(page.getByRole("button", { name: "4 bit" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "A, bit 3, 0" })).toBeVisible();

  await page.getByRole("button", { name: "8 bit" }).click();
  await expect(page.getByRole("button", { name: "A, bit 7, 0" })).toBeVisible();
  await page.getByRole("button", { name: "A, bit 0, 1" }).click();
  await expect(page.getByRole("button", { name: "A, bit 0, 0" })).toBeVisible();
  await expect(page.getByText(/As two's-complement: 6 \+ 1 stores 7/i)).toBeVisible();

  await page.getByRole("button", { name: "4 bit" }).click();
  await page.getByRole("button", { name: /^7 \+ 1/ }).click();
  const result = page.locator(".twos-result-card code");
  const carryEvidence = page.locator(".twos-evidence-card[data-carry-out]");
  const overflowEvidence = page.locator(".twos-evidence-card[data-signed-overflow]");
  const externalCarry = page
    .locator("[data-carry-out]")
    .filter({ hasText: /outside the 4-bit word/i });

  await expect(result).toHaveText("1000");
  await expect(carryEvidence).toHaveAttribute("data-carry-out", "0");
  await expect(overflowEvidence).toHaveAttribute("data-signed-overflow", "true");
  await expect(externalCarry).toHaveAttribute("data-carry-out", "0");
  await expect(carryEvidence).toContainText("Carry-out: no");
  await expect(overflowEvidence).toContainText("Signed overflow: yes");
  await expect(overflowEvidence).toContainText("sign-bit carry-in 1 ≠ carry-out 0");

  await page.getByRole("button", { name: /reset to url scenario/i }).click();
  await expect(page.getByRole("button", { name: "4 bit" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "A, bit 0, 1" })).toBeVisible();
  await expect(result).toHaveText("1000");
});
