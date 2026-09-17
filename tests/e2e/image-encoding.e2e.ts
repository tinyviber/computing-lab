import { expect, test } from "@playwright/test";

// The anonymous static preview runs the lab locally at the legacy URL: no
// class id means no API calls, so every stage check happens offline.
test("runs the core stages without external network access", async ({ page }) => {
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

  // photo at 25% / 256 colors is one of the verified under-budget artifacts.
  await page.goto(
    "labs/image-encoding?stage=1&image=photo&res=25&colors=palette8&showExperimentalLabs=1",
    { waitUntil: "networkidle" },
  );
  expect(nonLocalRequests).toEqual([]);
  await expect(page.locator("h1").first()).toHaveText(/AI 修复老照片/);

  // Core 1: encode the highlighted row by hand.
  await page
    .getByRole("textbox", { name: /高亮行的 16 bit/ })
    .pressSequentially("0111010101011001");
  await page.getByRole("button", { name: "检查编码" }).click();
  await expect(page.locator(".stage-feedback")).toContainText("通过");
  await page.getByRole("button", { name: /用约定 B 解码同一串 bit/ }).click();
  await expect(page.getByRole("img", { name: /同一串 bit 按约定 B · 彩色解码/ })).toBeVisible();

  // Core 2: the artifact carried by the URL is already inside the budget.
  await page.getByRole("button", { name: /在预算内保存/ }).click();
  await expect(page.getByRole("heading", { name: /用八分之一的 bit 保存照片/ })).toBeVisible();
  await expect(page.getByRole("img", { name: "原始照片" })).toHaveAttribute("width", "240");
  await expect(page.getByText(/编码栅格 60 × 40/)).toBeVisible();
  await page.getByRole("button", { name: "保存这张老照片" }).click();
  await expect(page.locator(".stage-feedback")).toContainText("通过");

  // Core 3: invert eight unsampled pixels; the encoding signature must not
  // change. At 25% sampling only every fourth source column is stored, and the
  // 16×16 window starts on a sampled column, so x = 1, 2, 3 are never read.
  await page.getByRole("button", { name: /丢掉的信息回不来/ }).click();
  for (const [x, y] of [
    [1, 0],
    [2, 0],
    [3, 0],
    [1, 1],
    [2, 1],
    [3, 1],
    [1, 2],
    [2, 2],
  ]) {
    await page.getByRole("button", { name: `像素 ${x},${y}`, exact: true }).click();
  }
  await expect(page.locator(".collision-evidence")).toContainText("完全相同");
  await page.getByRole("button", { name: "检查是否 many-to-one" }).click();
  await expect(page.locator(".stage-feedback")).toContainText("通过");
  await expect(page.locator(".image-stage-heading strong").first()).toHaveText("3 / 3");

  // With all three cores passed the challenge rail entries unlock.
  await expect(page.getByRole("button", { name: /AI 修复/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /抓幻觉/ })).toBeEnabled();
  expect(nonLocalRequests).toEqual([]);
});

test("maps legacy scenario URLs onto the staged lesson", async ({ page }) => {
  await page.goto("labs/image-encoding?scenario=low-sampling&showExperimentalLabs=1", {
    waitUntil: "networkidle",
  });
  await expect(page.getByRole("heading", { name: /约定决定 bit 的意义/ })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "图像编码关卡" })).toBeVisible();

  await page.goto(
    "labs/image-encoding?image=checkerboard&sample=25&bits=2&view=representation&showExperimentalLabs=1",
    { waitUntil: "networkidle" },
  );
  await expect(page.getByRole("heading", { name: /约定决定 bit 的意义/ })).toBeVisible();

  await page.goto(
    "labs/image-encoding?image=checkerboard&sample=25&bits=2&view=error&showExperimentalLabs=1",
    { waitUntil: "networkidle" },
  );
  await expect(
    page.getByRole("heading", { name: /改原图，但让编码一个 bit 都不变/ }),
  ).toBeVisible();
  await expect(page.getByRole("grid", { name: "可编辑原图窗口" })).toBeVisible();
});
