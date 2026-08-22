import { expect, test, type Page } from "@playwright/test";

async function expectSourceIdentity(page: Page, kind: string, label: string) {
  const meta = page.locator(".source-meta");
  const fixedSource = page.locator(".source-controls .fixed-source");
  await expect(meta.locator("span")).toHaveText(kind);
  await expect(meta.locator("strong")).toHaveText(label);
  await expect(fixedSource.locator("span")).toHaveText(kind);
  await expect(fixedSource.locator("strong")).toHaveText(label);
}

test("walks the sequential image-encoding flow without external network access", async ({
  page,
}) => {
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

  await page.goto("labs/image-encoding", {
    waitUntil: "networkidle",
  });
  expect(nonLocalRequests).toEqual([]);
  await expect(page.locator("h1").first()).toHaveText(/图像编码/);
  await expectSourceIdentity(page, "固定样例", "小猫插图");
  await expect(page.getByText("小猫插图").first()).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
  await expect(page.getByRole("slider", { name: /空间采样/ })).toBeEnabled();
  await expect(page.getByRole("slider", { name: /采样网格相位/ })).toBeDisabled();
  await expect(page.getByLabel(/上传图片（可选）/)).toBeEnabled();
  await expect(page.getByRole("button", { name: "PNG", exact: true })).toBeDisabled();
  await expect(page.getByRole("img", { name: /原始源图像/ })).toHaveAttribute("width", "240");
  await expect(page.getByRole("img", { name: /原始源图像/ })).toHaveAttribute("height", "160");

  for (const [fixture, label] of [
    ["gradient", "平滑色彩渐变"],
    ["checkerboard", "细棋盘格"],
  ] as const) {
    await page.goto(`labs/image-encoding?image=${fixture}&sample=25&bits=2&view=representation`, {
      waitUntil: "networkidle",
    });
    await expectSourceIdentity(page, "兼容样例", label);
    await expect(page.getByText("小猫插图")).toHaveCount(0);
    await expect(page.locator("select")).toHaveCount(0);
    await expect(page.getByRole("grid", { name: /12 × 8 编码采样网格/ })).toBeVisible();
    await expect(page.getByRole("img", { name: /原始源图像/ })).toHaveAttribute("width", "48");
    await expect(page.getByRole("img", { name: /重建图像/ })).toHaveAttribute("width", "48");
  }

  await page.goto(
    "labs/image-encoding?image=gradient&sample=25&phase=0.5&bits=2&color=palette&view=representation",
    { waitUntil: "networkidle" },
  );
  expect(nonLocalRequests).toEqual([]);

  const sampling = page.getByRole("slider", { name: /空间采样/ });
  await sampling.focus();
  await sampling.press("ArrowRight");
  await expect(sampling).toHaveValue("30");
  await expect(page.getByRole("button", { name: "调色板", exact: true })).toBeEnabled();

  await page.getByRole("button", { name: "调色板", exact: true }).click();
  const bitDepth = page.getByRole("slider", { name: /颜色位深/ });
  await expect(bitDepth).toBeEnabled();
  await bitDepth.focus();
  await bitDepth.press("ArrowLeft");
  await expect(bitDepth).toHaveValue("1");

  const calculator = page.locator("section[aria-labelledby=calculator-heading]");
  const width = calculator.getByRole("spinbutton", { name: "宽度（像素）" });
  const height = calculator.getByRole("spinbutton", { name: "高度（像素）" });
  const bits = calculator.getByRole("spinbutton", { name: "每像素位数" });
  await expect(width).toBeEnabled();
  await expect(height).toBeEnabled();
  await expect(bits).toBeEnabled();
  await width.fill("3");
  await height.fill("3");
  await bits.fill("5");

  const png = page.getByRole("button", { name: "PNG", exact: true });
  await expect(png).toBeEnabled();
  await png.click();
  await expect(png).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('section[aria-labelledby="payload-heading"]')).toContainText(
    /原始数据量/,
  );
  await expect(page.locator('section[aria-labelledby="payload-heading"]')).toContainText(
    /实际文件大小取决于图像内容/,
  );
  await expect(page.locator('section[aria-labelledby="payload-heading"]')).not.toContainText(
    /教学估算/,
  );

  await expect(calculator).toContainText("原始位数 = 宽度 × 高度 × 每像素位数");
  await expect(calculator).toContainText("3 × 3 × 5 = 45 位");
  await expect(calculator).toContainText("45 ÷ 8 后向上取整 = 6 字节");
  await expect(calculator).toContainText("压缩格式的实际大小取决于图像内容和编码器设置");
  await expect(
    page.locator(".lesson-flow-item").filter({ hasText: "3. 计算原始数据量" }),
  ).toContainText("已完成");
  await expect(
    page.locator(".lesson-flow-item").filter({ hasText: "4. 了解文件格式边界" }),
  ).toContainText("已完成");

  const reset = page.locator('section[aria-labelledby="source-heading"] button');
  await expect(reset).toHaveCount(1);
  await expect(reset).toHaveText("恢复初始情境");
  await reset.click();
  await expect(sampling).toHaveValue("25");
  await expect(page.getByRole("button", { name: "调色板", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "PNG", exact: true })).toBeDisabled();
  await expect(calculator.getByRole("spinbutton", { name: "宽度（像素）" })).toBeDisabled();
  await expect(page.getByText("完成第 2 步后解锁。")).toBeVisible();
  expect(nonLocalRequests).toEqual([]);
});

test("allows a bits=1 scenario to complete color adjustment", async ({ page }) => {
  await page.goto("labs/image-encoding?bits=1", { waitUntil: "networkidle" });

  const sampling = page.getByRole("slider", { name: /空间采样/ });
  await sampling.focus();
  await sampling.press("ArrowLeft");
  await expect(sampling).toHaveValue("45");

  await page.getByRole("button", { name: "调色板", exact: true }).click();
  await expect(
    page.locator(".lesson-flow-item").filter({ hasText: "2. 调整颜色表示" }),
  ).toContainText("已完成");
  await expect(
    page.locator('section[aria-labelledby="calculator-heading"] input').first(),
  ).toBeEnabled();
  await expect(page.getByRole("button", { name: "PNG", exact: true })).toBeDisabled();
});
