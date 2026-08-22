import { expect, test, type Page } from "@playwright/test";

async function expectSourceIdentity(page: Page, kind: string, label: string) {
  const meta = page.locator(".source-meta");
  const fixedSource = page.locator(".source-controls .fixed-source");
  await expect(meta.locator("span")).toHaveText(kind);
  await expect(meta.locator("strong")).toHaveText(label);
  await expect(fixedSource.locator("span")).toHaveText(kind);
  await expect(fixedSource.locator("strong")).toHaveText(label);
}

test("runs one image-encoding feedback loop without external network access", async ({ page }) => {
  const nonLocalRequests: string[] = [];

  await page.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    const isLocalhost = requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1";
    if (!isLocalhost) {
      nonLocalRequests.push(requestUrl.href);
      await route.abort();
      return;
    }
    await route.continue();
  });

  await page.goto("labs/image-encoding", { waitUntil: "networkidle" });
  expect(nonLocalRequests).toEqual([]);
  await expect(page.locator("h1").first()).toHaveText(/图像编码/);
  await expectSourceIdentity(page, "固定样例", "小猫插图");
  await expect(page.getByText("小猫插图").first()).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
  await expect(page.getByRole("slider", { name: /空间采样/ })).toBeEnabled();
  await expect(page.getByRole("slider", { name: /颜色位深/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "调色板", exact: true })).toBeEnabled();
  const budget = page.locator('[data-budget="baseline-25-percent"]');
  await expect(budget).toHaveAttribute("data-budget", "baseline-25-percent");
  await expect(budget).not.toContainText(/理论原始|平均 RGB|采样率/);
  await expect(budget).toContainText(/原来的四分之一以内/);
  await expect(budget).toContainText(/平均颜色变化（不是清晰度评分）/);
  await expect(budget).toContainText(/空间不够/);
  await expect(budget).toHaveAttribute("data-budget-state", "over");
  await expect(page.locator('[data-metric="budget-raw-bits"]')).toContainText(/位/);
  await expect(page.locator('[data-metric="current-raw-bits"]')).toContainText(/位/);
  await expect(page.locator('[data-metric="raw-bits-delta"]')).toContainText(/位/);
  await expect(page.locator('[data-metric="budget-raw-bytes"]')).toContainText(/字节/);
  await expect(page.locator('[data-metric="current-raw-bytes"]')).toContainText(/字节/);
  await expect(page.locator('[data-metric="raw-bytes-delta"]')).toContainText(/字节/);
  await expect(page.locator('[data-metric="current-sampled-pixels"]')).toContainText(/个/);
  await expect(page.locator('[data-metric="changed-pixels"]')).toContainText(/个/);
  await expect(page.locator('[data-feedback="observation"]')).toBeVisible();
  await expect(page.locator('[data-feedback="judgment"]')).toBeVisible();
  await expect(page.locator('[data-metric="current-raw-bits"]')).toContainText(/位/);
  await expect(page.locator('[data-metric="raw-bits-delta"]')).toBeVisible();
  await expect(page.locator('[data-metric="average-error"]')).toBeVisible();
  await expect(page.locator('[data-metric="changed-pixels"]')).toBeVisible();
  await expect(page.getByLabel(/上传图片（可选）/)).toBeEnabled();
  await expect(page.getByRole("img", { name: /原始源图像/ })).toHaveAttribute("width", "240");
  await expect(page.getByRole("img", { name: /原始源图像/ })).toHaveAttribute("height", "160");

  const currentBits = page.locator('[data-metric="current-raw-bits"]');
  const before = await currentBits.textContent();
  const sampling = page.getByRole("slider", { name: /空间采样/ });
  await sampling.focus();
  for (let index = 0; index < 5; index += 1) await sampling.press("ArrowLeft");
  await expect(sampling).toHaveValue("25");
  await expect(currentBits).not.toHaveText(before ?? "");
  await expect(page.locator('[data-metric="current-sampled-pixels"]')).toContainText(
    /60 × 40|2400/,
  );
  await expect(page.locator('[data-feedback="judgment"]')).toContainText(/占用的?空间|颜色变化/);
  await expect(budget).toHaveAttribute("data-budget-state", "within");
  await expect(budget).toContainText(/空间够用/);

  await page.getByRole("button", { name: "调色板", exact: true }).click();
  const bitDepth = page.getByRole("slider", { name: /颜色位深/ });
  await bitDepth.focus();
  await bitDepth.press("ArrowLeft");
  await expect(bitDepth).toHaveValue("3");
  await expect(page.locator('[data-metric="current-raw-bits"]')).toBeVisible();
  expect(nonLocalRequests).toEqual([]);
});

test("keeps fixture, legacy URL, upload, reset, and canvas behavior", async ({ page }) => {
  await page.goto("labs/image-encoding?scenario=low-sampling", { waitUntil: "networkidle" });
  await expectSourceIdentity(page, "兼容样例", "细棋盘格");
  await expect(page.getByRole("slider", { name: /空间采样/ })).toHaveValue("25");
  await expect(page.getByRole("grid", { name: /12 × 8 编码采样网格/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /原始源图像/ })).toHaveAttribute("width", "48");
  await expect(page.getByRole("img", { name: /重建图像/ })).toHaveAttribute("width", "48");

  await page.goto(
    "labs/image-encoding?image=checkerboard&sample=25&phase=0.5&bits=2&view=representation",
    { waitUntil: "networkidle" },
  );
  await expect(page.getByRole("slider", { name: /空间采样/ })).toHaveValue("25");
  await expect(page.getByRole("tab", { name: /编码表示/ })).toBeEnabled();
  await expect(page.getByRole("img", { name: /原始源图像/ })).toHaveAttribute("width", "48");
  await expect(page.getByRole("img", { name: /重建图像/ })).toHaveAttribute("width", "48");

  const upload = page.getByLabel(/上传图片（可选）/);
  await upload.setInputFiles({
    name: "uploaded.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByText(/已载入 uploaded\.png/)).toBeVisible();
  await expect(page.getByText("uploaded.png").first()).toBeVisible();

  const reset = page.locator('section[aria-labelledby="source-heading"] button');
  await expect(reset).toHaveCount(1);
  await reset.click();
  await expect(page.getByRole("slider", { name: /空间采样/ })).toHaveValue("25");
  await expect(page.getByText("细棋盘格").first()).toBeVisible();
  await expect(page.locator('[data-budget="baseline-25-percent"]')).toHaveAttribute(
    "data-budget",
    "baseline-25-percent",
  );
  await expect(page.locator('[data-budget="baseline-25-percent"]')).toContainText(
    /原来的四分之一以内/,
  );
});
