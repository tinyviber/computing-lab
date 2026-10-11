import { expect, test } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scenarios = [
  "initial",
  "incomplete-cloze",
  "decoded",
  "run-error",
  "bits-stage",
  "bmp-stage",
  "files-stage",
  "judge-failed",
  "saving",
  "save-error",
  "load-error",
  "wrong-pick",
];

for (const viewport of ["desktop", "tablet", "mobile"]) {
  test(`decoding fixed scenes at ${viewport} without API or authentication`, async ({ page }) => {
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
    await page.goto(`__dev/labs/decoding?scenario=initial&viewport=${viewport}`);
    await expect(page.getByRole("heading", { name: "解码侦探视觉开发预览" })).toBeVisible();
    const frame = page.frameLocator('iframe[title="解码侦探实验预览"]');
    for (const scenario of scenarios) {
      await page.getByLabel("固定场景").selectOption(scenario);
      await expect(page).toHaveURL(new RegExp(`scenario=${scenario}`));
      await expect(frame.locator(".lab-preview-event")).toHaveAttribute("data-scene", scenario);
      await expect(frame.getByRole("main", { name: "解码实验区" })).toBeVisible();
      await expect(frame.locator("vite-error-overlay")).toHaveCount(0);
      if (scenario === "files-stage") {
        await expect(frame.getByRole("button", { name: "提交判定", exact: true })).toBeDisabled();
      }
      if (scenario === "decoded") {
        await expect(frame.getByRole("button", { name: "提交判定", exact: true })).toBeEnabled();
        await frame.getByRole("button", { name: "提交判定", exact: true }).click();
        await expect(frame.getByRole("status")).toContainText("submit");
      }
      if (scenario === "judge-failed") await expect(frame.getByText(/判定未通过/)).toBeVisible();
      if (scenario === "save-error")
        await expect(frame.getByText("保存失败", { exact: true })).toBeVisible();
      if (scenario === "load-error")
        await expect(frame.getByRole("alert")).toContainText("草稿加载失败");
      // Save review evidence outside the checkout; no machine-specific baselines.
      await page.screenshot({
        path: join(tmpdir(), `computing-lab-decoding-${viewport}-${scenario}.png`),
      });
    }
    await page.getByLabel("预览视口").selectOption(viewport === "mobile" ? "desktop" : "mobile");
    await expect(page.locator("iframe")).toHaveCSS(
      "width",
      viewport === "mobile" ? "1440px" : "393px",
    );
    expect(requests, "preview must not read or mutate live data").toEqual([]);
    expect(errors).toEqual([]);
  });
}
