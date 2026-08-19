import { expect, test } from "@playwright/test";

test("explores a fixed-width two's-complement overflow trajectory", async ({ page }) => {
  await page.goto("labs/twos-complement?width=4&a=0111&b=0001&reading=signed", {
    waitUntil: "networkidle",
  });

  await expect(page.getByRole("button", { name: "4 位" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "A，第 3 位，0" })).toBeVisible();

  await page.getByRole("button", { name: "8 位" }).click();
  await expect(page.getByRole("button", { name: "A，第 7 位，0" })).toBeVisible();
  await page.getByRole("button", { name: "A，第 0 位，1" }).click();
  await expect(page.getByRole("button", { name: "A，第 0 位，0" })).toBeVisible();
  await expect(page.getByText(/按有符号.*6.*1.*存储为.*7/)).toBeVisible();

  await page.getByRole("button", { name: "4 位", exact: true }).click();
  await page.getByRole("button", { name: /^7 \+ 1/ }).click();
  const result = page.locator(".twos-result-card code");
  const carryEvidence = page.locator(".twos-evidence-card[data-carry-out]");
  const overflowEvidence = page.locator(".twos-evidence-card[data-signed-overflow]");
  const externalCarry = page
    .locator("[data-carry-out]")
    .filter({ hasText: /存储字之外|4 位字之外/ });

  await expect(result).toHaveText("1000");
  await expect(carryEvidence).toHaveAttribute("data-carry-out", "0");
  await expect(overflowEvidence).toHaveAttribute("data-signed-overflow", "true");
  await expect(externalCarry).toHaveAttribute("data-carry-out", "0");
  await expect(carryEvidence).toContainText("输出进位：无");
  await expect(overflowEvidence).toContainText("有符号溢出：有");
  await expect(overflowEvidence).toContainText("符号位输入进位 1 ≠ 输出进位 0");

  await page.getByRole("button", { name: "恢复初始情境", exact: true }).click();
  await expect(page.getByRole("button", { name: "4 位" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "A，第 0 位，1" })).toBeVisible();
  await expect(result).toHaveText("1000");
});
