import { expect, test } from "@playwright/test";

test("traces acknowledgment loss, timeout, retry, and duplicate suppression", async ({ page }) => {
  await page.goto("labs/protocol-process?scenario=ack-loss", { waitUntil: "networkidle" });

  await expect(page.getByRole("main", { name: "可靠送达实验区" })).toBeVisible();
  await page.getByRole("combobox", { name: "你的预测" }).selectOption("delivered");
  await page.getByRole("button", { name: "记录预测" }).click();
  await page.getByRole("button", { name: "运行到结束" }).click();

  await page.getByRole("button", { name: "检查第一个故障" }).click();
  await expect(page.getByRole("region", { name: "选中事件结果" })).toContainText(/时刻 5.*已丢失/);
  await page.getByRole("button", { name: "检查重试" }).click();
  await expect(page.getByRole("region", { name: "选中事件结果" })).toContainText(
    /第 2 次请求重试|第 2 次尝试/,
  );
  await expect(page.getByRole("region", { name: "最终协议结果" })).toContainText(
    /状态：已送达.*尝试次数：2.*重复抑制：1/,
  );

  const finalFrame = page.getByRole("button", { name: /第 9 步.*时刻 10.*送达确认/ });
  await finalFrame.focus();
  await page.keyboard.press("Enter");
  await expect(finalFrame).toHaveAttribute("aria-current", "true");
});

test.describe("responsive evidence", () => {
  test.use({ viewport: { width: 520, height: 900 } });

  test("keeps queue and status evidence usable on a narrow viewport", async ({ page }) => {
    await page.goto("labs/protocol-process?scenario=no-loss", { waitUntil: "networkidle" });

    await expect(page.getByRole("main", { name: "可靠送达实验区" })).toBeVisible();
    await page.getByRole("button", { name: "执行一步" }).click();
    await expect(page.getByRole("table", { name: "选中事件后的协议计数" })).toBeVisible();
    await expect(page.getByRole("region", { name: "最终协议结果" })).toBeVisible();
  });
});
