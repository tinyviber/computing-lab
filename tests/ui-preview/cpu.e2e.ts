import { expect, test } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scenarios = [
  "initial",
  "running",
  "blocked",
  "judge-failed",
  "challenge",
  "saving",
  "save-error",
  "load-error",
  "byte-gated",
  "alu-exec",
];

for (const viewport of ["desktop", "tablet", "mobile"]) {
  test(`CPU fixed scenes at ${viewport} without API or authentication`, async ({ page }) => {
    const errors: string[] = [];
    const requests: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setViewportSize({
      width: viewport === "desktop" ? 1536 : viewport === "tablet" ? 1024 : 480,
      height: 1100,
    });
    await page.route(
      (url) => url.pathname.startsWith("/api/"),
      async (route) => {
        requests.push(route.request().url());
        await route.abort();
      },
    );
    await page.goto(`__dev/labs/cpu?scenario=initial&viewport=${viewport}`);
    await expect(page.getByRole("heading", { name: "CPU 视觉开发预览" })).toBeVisible();
    const frame = page.frameLocator('iframe[title="CPU 实验预览"]');
    for (const scenario of scenarios) {
      await page.getByLabel("固定场景").selectOption(scenario);
      await expect(page).toHaveURL(new RegExp(`scenario=${scenario}`));
      await expect(frame.locator(".cpu-preview-event")).toHaveAttribute("data-scene", scenario);
      await expect(frame.getByRole("main", { name: "CPU 数据通路实验区" })).toBeVisible();
      await expect(frame.locator("vite-error-overlay")).toHaveCount(0);
      await expect(frame.getByRole("button", { name: "提交判定", exact: true })).toBeDisabled();
      if (scenario === "running") {
        await expect(frame.getByRole("button", { name: "下一拍" })).toBeDisabled();
        await frame.getByRole("button", { name: "暂停" }).click();
        await expect(frame.getByRole("status")).toContainText("pause");
      }
      if (scenario === "blocked") {
        await expect(frame.getByRole("button", { name: "下一拍" })).toBeDisabled();
        await expect(frame.locator(".cpu-block-banner")).toBeVisible();
      }
      if (scenario === "challenge") {
        await expect(
          frame.getByRole("button", { name: "添加一条指令", exact: false }),
        ).toBeVisible();
      }
      if (scenario === "judge-failed")
        await expect(frame.getByText(/服务器判定：未通过/)).toBeVisible();
      if (scenario === "save-error")
        await expect(frame.getByText("保存失败", { exact: true })).toBeVisible();
      if (scenario === "load-error")
        await expect(frame.getByRole("alert")).toContainText("草稿加载失败");
      if (scenario === "alu-exec" || scenario === "running") {
        await frame.locator(".cpu-viz-grid").scrollIntoViewIfNeeded();
      }
      // Save review evidence outside the checkout; no machine-specific baselines.
      await page.screenshot({
        path: join(tmpdir(), `computing-lab-cpu-${viewport}-${scenario}.png`),
      });
    }
    await page.getByLabel("预览视口").selectOption(viewport === "mobile" ? "desktop" : "mobile");
    await expect(page.locator("iframe")).toHaveCSS(
      "width",
      viewport === "mobile" ? "1440px" : "393px",
    );
    expect(requests, "preview must not read or mutate live data").toEqual([]);
    expect(errors).toEqual([]);
    if (viewport === "desktop") {
      // Leaving the DEV route must restore normal authentication refresh.
      await page.route("**/api/auth/me", (route) => route.fulfill({ status: 401, body: "{}" }));
      await Promise.all([
        page.waitForRequest("**/api/auth/me"),
        page.getByRole("link", { name: "返回首页", exact: true }).click(),
      ]);
      await expect(page.getByRole("link", { name: /^登录/ })).toBeVisible();
    }
  });
}
