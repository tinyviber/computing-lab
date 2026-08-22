import { expect, test } from "@playwright/test";

test("traces deterministic Monte Carlo convergence for pi", async ({ page }) => {
  await page.goto("labs/monte-carlo?scenario=small", { waitUntil: "networkidle" });

  await expect(page.getByRole("main", { name: "蒙特卡洛 π实验区" })).toBeVisible();
  await page.getByRole("button", { name: "运行到结束" }).click();

  await expect(page.locator('output[aria-label="最终蒙特卡洛估计值"]')).toHaveText(/3\.08/);
  await expect(page.getByRole("region", { name: /最终蒙特卡洛结果/ })).toContainText(
    /最终误差为\s*0\.0616/,
  );

  const batch2 = page.getByRole("button", { name: /第 2 批.*500 个样本.*375 个在圆内/ });
  await batch2.focus();
  await page.keyboard.press("Enter");
  await expect(batch2).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("table", { name: "样例比较" })).toContainText(/3\.1448/);
  const geometry = page.getByRole("region", { name: /蒙特卡洛几何结果/ });
  await expect(geometry).toContainText(/当前显示本批 250 个点中的 128 个/);
  await expect(geometry).toContainText(/四分之一圆面积 \/ 正方形面积 = π \/ 4/);
  await expect(geometry.locator("[data-monte-carlo-point]")).toHaveCount(128);
});

test("keeps URL recovery and step evidence independent of a submit gate", async ({ page }) => {
  await page.goto("labs/monte-carlo?scenario=large", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "执行一步" }).click();
  await expect(page.getByRole("region", { name: /选中蒙特卡洛结果/ })).toContainText(/批次后样本/);
  await expect(page.getByRole("button", { name: /submit|score|check/i })).toHaveCount(0);
  await page.getByRole("button", { name: "恢复初始情境" }).click();
  await expect(page.getByRole("combobox", { name: /蒙特卡洛样例/ })).toHaveValue("large");
});

test.describe("responsive evidence", () => {
  test.use({ viewport: { width: 520, height: 900 } });

  test("keeps convergence tables and status usable on a narrow viewport", async ({ page }) => {
    await page.goto("labs/monte-carlo?scenario=small", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "执行一步" }).click();
    await expect(page.getByRole("table", { name: /批次收敛/ })).toBeVisible();
    await expect(page.getByRole("region", { name: /选中蒙特卡洛结果/ })).toBeVisible();
    await expect(page.getByRole("region", { name: /蒙特卡洛几何结果/ })).toBeVisible();
  });
});
