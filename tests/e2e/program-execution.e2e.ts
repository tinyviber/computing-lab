import { expect, test } from "@playwright/test";

test("traces variable mutation and the final false loop condition", async ({ page }) => {
  await page.goto("labs/program-execution?fixture=sum-1-to-3", { waitUntil: "networkidle" });

  await expect(page.getByRole("main", { name: "程序执行实验区" })).toBeVisible();
  await page.getByRole("spinbutton", { name: /预测输出值/ }).fill("6");
  await page.getByRole("button", { name: "记录预测" }).click();

  for (let index = 0; index < 5; index += 1) {
    await page.getByRole("button", { name: "执行一步" }).click();
  }
  await page.getByRole("button", { name: "检查变量变化" }).click();
  await expect(page.getByRole("region", { name: /选中步骤详情/ })).toContainText(
    /total:\s*0\s*→\s*1/,
  );

  await page.getByRole("button", { name: "运行到结束" }).click();
  await page.getByRole("button", { name: "检查循环停止" }).click();
  await expect(page.getByRole("region", { name: /选中步骤详情/ })).toContainText(/4 <= 3.*假/);
  await expect(page.getByRole("status", { name: "程序输出" })).toHaveText("6");
  await expect(page.getByText(/预测：6；实际值：6/)).toBeVisible();

  await page.getByRole("button", { name: /第 13 步，第 7 行，输出/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /第 13 步，第 7 行，输出/ })).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test.describe("responsive evidence", () => {
  test.use({ viewport: { width: 520, height: 900 } });

  test("keeps source, controls, table, and output evidence usable on a narrow viewport", async ({
    page,
  }) => {
    await page.goto("labs/program-execution?fixture=zero-iterations", { waitUntil: "networkidle" });

    await expect(page.getByRole("main", { name: "程序执行实验区" })).toBeVisible();
    await expect(page.getByRole("list", { name: "程序步骤" })).toBeVisible();
    await expect(page.getByRole("button", { name: "执行一步" })).toBeVisible();
    await expect(page.getByRole("button", { name: "运行到结束" })).toBeVisible();
    await expect(page.getByRole("table", { name: /初始变量/ })).toBeVisible();
    await expect(page.getByRole("status", { name: "程序输出" })).toHaveText("—");
  });
});
