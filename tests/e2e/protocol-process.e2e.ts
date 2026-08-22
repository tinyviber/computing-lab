import { expect, test } from "@playwright/test";

async function runToEnd(page: import("@playwright/test").Page) {
  const next = page.getByRole("button", { name: "执行下一个事件" });
  while (await next.isEnabled()) await next.click();
}

test("keeps semantic trace and queue projection aligned across all four scenarios", async ({
  page,
}) => {
  for (const scenario of ["no-loss", "request-loss", "ack-loss", "receiver-silent"]) {
    await page.goto(`labs/protocol-process?scenario=${scenario}`, { waitUntil: "networkidle" });
    await runToEnd(page);
    await expect(page.getByRole("region", { name: "协议事件记录" })).toContainText(/个事件/);
    await expect(page.getByRole("table", { name: /之前的队列/ })).toBeVisible();
    await expect(page.getByRole("table", { name: /之后的队列/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "最终协议结果" })).toBeVisible();
  }
});

test("makes timeout uncertainty, retry, and duplicate evidence inspectable", async ({ page }) => {
  await page.goto("labs/protocol-process?scenario=ack-loss", { waitUntil: "networkidle" });
  await runToEnd(page);
  await page.getByRole("button", { name: /超时/ }).click();
  await expect(page.getByRole("region", { name: "选中事件结果" })).toContainText(
    /不能证明接收方没有收到请求/,
  );
  await expect(page.getByRole("region", { name: "最终协议结果" })).toContainText(/重复抑制：1/);
});

test("restores the initial URL scenario", async ({ page }) => {
  await page.goto("labs/protocol-process?scenario=request-loss", { waitUntil: "networkidle" });
  await page.getByRole("combobox", { name: "消息情境" }).selectOption("no-loss");
  await page.getByRole("button", { name: "恢复初始情境" }).click();
  await expect(page.getByRole("combobox", { name: "消息情境" })).toHaveValue("request-loss");
});
