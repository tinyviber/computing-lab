import { expect, test } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectFrameHeightSynced, fullPageShot } from "./helpers";

const scenarios = [
  "initial",
  "inputs-changed",
  "step-memory",
  "step-controller",
  "step-alu",
  "step-output",
  "think-page",
  "think-wrong",
  "storage-initial",
  "storage-unsaved",
  "storage-power-off",
  "storage-correct",
  "phone-initial",
  "phone-step-input",
  "phone-step-output",
  "phone-wrong",
  "saving",
  "save-error",
  "load-error",
];

for (const viewport of ["desktop", "tablet", "mobile"]) {
  test(`five-parts fixed scenes at ${viewport} without API or authentication`, async ({ page }) => {
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
    await page.goto(`__dev/labs/five-parts?scenario=initial&viewport=${viewport}`);
    await expect(page.getByRole("heading", { name: "五大部件视觉开发预览" })).toBeVisible();
    const frame = page.frameLocator('iframe[title="五大部件实验预览"]');
    for (const scenario of scenarios) {
      await page.getByLabel("固定场景").selectOption(scenario);
      await expect(page).toHaveURL(new RegExp(`scenario=${scenario}`));
      await expect(frame.locator(".lab-preview-event")).toHaveAttribute("data-scene", scenario);
      await expect(frame.getByRole("main", { name: "五大部件实验区" })).toBeVisible();
      await expect(frame.locator("vite-error-overlay")).toHaveCount(0);
      if (scenario === "initial") {
        await expect(frame.getByText(/步骤 0\/4/)).toBeVisible();
        await expect(frame.getByRole("status").last()).toHaveText("—");
      }
      if (scenario === "step-alu") {
        await expect(frame.getByText("3 + 5 = 8")).toBeVisible();
      }
      if (scenario === "step-output") {
        await expect(frame.getByRole("button", { name: "重新运行" })).toBeVisible();
        await expect(frame.getByRole("button", { name: "继续：观察与思考" })).toBeEnabled();
      }
      if (scenario === "think-page") {
        await expect(
          frame.getByText("如果运算器只负责计算，那么是谁指挥它进行加法的？"),
        ).toBeVisible();
      }
      if (scenario === "think-wrong") {
        // Verdict copy is server-written; previews show a synthetic stand-in.
        await expect(frame.getByRole("alert")).toContainText("预览：示例反馈");
      }
      if (scenario === "storage-unsaved") {
        await expect(frame.getByText("有没保存的改动")).toBeVisible();
        await expect(frame.getByText(/数出：2 句/)).toBeVisible();
      }
      if (scenario === "storage-power-off") {
        await expect(frame.getByText("（已断电，空）")).toBeVisible();
        await expect(frame.getByRole("button", { name: "开机" })).toBeEnabled();
        await expect(frame.getByRole("button", { name: "打开文件" })).toBeDisabled();
      }
      if (scenario === "phone-step-output") {
        const touch = frame.getByRole("region", { name: "触摸屏" });
        await expect(touch.getByText("输入设备")).toBeVisible();
        await expect(touch.getByText("输出设备")).toBeVisible();
      }
      if (scenario === "save-error")
        await expect(frame.getByText("保存失败", { exact: true })).toBeVisible();
      if (scenario === "load-error")
        await expect(frame.getByRole("alert")).toContainText("草稿加载失败");
      await expectFrameHeightSynced(page);
      await fullPageShot(
        page,
        join(tmpdir(), `computing-lab-five-parts-${viewport}-${scenario}.png`),
      );
    }
    // The demo never leaks retired-lab vocabulary into the student surface.
    await expect(frame.getByText(/寄存器|操作码|汇编|指令/)).toHaveCount(0);
    expect(requests, "preview must not read or mutate live data").toEqual([]);
    expect(errors).toEqual([]);
  });
}
