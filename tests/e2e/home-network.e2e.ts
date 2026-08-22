import { expect, test } from "@playwright/test";

const scenarios = [
  { id: "first-home-setup", target: "printer", outcome: "已送达", failure: "没有停止事件" },
  { id: "static-printer", target: "printer", outcome: "已停止", failure: "no-route" },
  { id: "remote-internet", target: "internet", outcome: "已送达", failure: "没有停止事件" },
  { id: "wrong-gateway", target: "internet", outcome: "已停止", failure: "gateway-unresolved" },
  { id: "duplicate-ip", target: "printer", outcome: "已停止", failure: "duplicate-address" },
  { id: "invalid-config", target: "printer", outcome: "已停止", failure: "invalid-ip" },
] as const;

test.describe("Home Network probe loop", () => {
  test("shows hand-authored first-failure facts for all six scenarios", async ({ page }) => {
    for (const scenario of scenarios) {
      await page.goto(`labs/home-network?scenario=${scenario.id}&target=${scenario.target}`, {
        waitUntil: "networkidle",
      });
      await expect(page.locator(".scenario-chip")).not.toContainText(scenario.id);
      await expect(page.locator(".scenario-chip")).toHaveAttribute(
        "aria-label",
        "当前家庭网络情境",
      );
      await page.getByRole("button", { name: /发送探针/ }).click();

      await expect(page.locator(".probe-outcome")).toContainText(scenario.outcome);
      await expect(page.locator(".failure-panel")).toContainText(scenario.failure);
      await expect(page.getByRole("region", { name: /事件链/ })).toBeVisible();
    }
  });

  test("probes, edits the first failure, reprobes, and preserves history", async ({ page }) => {
    await page.goto("labs/home-network?scenario=static-printer&target=printer", {
      waitUntil: "networkidle",
    });

    await page.getByRole("combobox", { name: /选择设备/ }).selectOption("printer");
    await page.getByRole("button", { name: /发送探针/ }).click();
    await expect(page.locator(".probe-outcome")).toContainText("已停止");
    await expect(page.locator(".failure-panel")).toContainText("no-route");

    const traceEvent = page.locator(".trace-event-button").first();
    await traceEvent.focus();
    await page.keyboard.press("Enter");
    await expect(traceEvent).toHaveAttribute("aria-current", "step");

    const printerIp = page.locator("#device-ip");
    await printerIp.fill("192.168.1.30");
    await page.getByRole("button", { name: /发送探针/ }).click();

    await expect(page.locator(".probe-outcome")).toContainText("已送达");
    await expect(page.locator(".failure-panel")).toContainText("没有停止事件");
    await expect(page.locator(".history-list")).toContainText("已停止");
    await expect(page.locator(".history-list")).toContainText("已送达");
    await expect(page.locator(".history-list li")).toHaveCount(2);
    await expect(page.locator(".network-mission-status")).toContainText("验证成功");
  });
});

test.describe("Home Network responsive evidence", () => {
  test.use({ viewport: { width: 520, height: 900 } });

  test("keeps topology, probe controls, trace, and history keyboard-accessible", async ({
    page,
  }) => {
    await page.goto("labs/home-network?scenario=wrong-gateway&target=internet", {
      waitUntil: "networkidle",
    });

    await expect(page.getByRole("main", { name: /家庭网络探针实验区/ })).toBeVisible();
    await expect(page.getByRole("img", { name: /家庭网络拓扑/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /发送探针/ })).toBeVisible();
    await page.getByRole("button", { name: /发送探针/ }).click();
    await expect(page.getByRole("region", { name: /事件链/ })).toBeVisible();
    await expect(page.getByRole("region", { name: /事件链/ })).toContainText(/gateway|网关|失败/i);
  });
});
