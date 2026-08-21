import { expect, test, type Page } from "@playwright/test";

async function expectSourceIdentity(page: Page, kind: string, label: string) {
  const meta = page.locator(".source-meta");
  const fixedSource = page.locator(".source-controls .fixed-source");
  await expect(meta.locator("span")).toHaveText(kind);
  await expect(meta.locator("strong")).toHaveText(label);
  await expect(fixedSource.locator("span")).toHaveText(kind);
  await expect(fixedSource.locator("strong")).toHaveText(label);
}

test("keeps default and legacy image source identities local and truthful", async ({ page }) => {
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
  await expectSourceIdentity(page, "固定样例", "小猫照片");
  await expect(page.getByText("小猫照片").first()).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
  await expect(page.getByRole("img", { name: /原始源图像/ })).toHaveAttribute("width", "48");
  await expect(page.getByRole("img", { name: /原始源图像/ })).toHaveAttribute("height", "32");

  for (const [fixture, label] of [
    ["gradient", "平滑色彩渐变"],
    ["checkerboard", "细棋盘格"],
  ] as const) {
    await page.goto(`labs/image-encoding?image=${fixture}&sample=25&bits=2&view=representation`, {
      waitUntil: "networkidle",
    });
    await expectSourceIdentity(page, "兼容样例", label);
    await expect(page.getByText("小猫照片")).toHaveCount(0);
    await expect(page.locator("select")).toHaveCount(0);
    await expect(page.getByRole("grid", { name: /12 × 8 编码采样网格/ })).toBeVisible();
    await expect(page.getByRole("img", { name: /原始源图像/ })).toHaveAttribute("width", "48");
    await expect(page.getByRole("img", { name: /重建图像/ })).toHaveAttribute("width", "48");
  }

  await page.goto(
    "labs/image-encoding?image=gradient&sample=25&phase=0.5&bits=2&view=representation",
    {
      waitUntil: "networkidle",
    },
  );
  const sampling = page.getByRole("slider", { name: /空间采样/ });
  await sampling.fill("45");
  await page.getByRole("tab", { name: /采样重建/ }).click();
  const legacyTask = page
    .locator(".mission-item")
    .filter({ hasText: /观察采样重建/ })
    .first();
  await expect(legacyTask).toContainText(/证据已出现/);
  await page.getByRole("slider", { name: /颜色位深/ }).fill("8");
  await page.getByRole("slider", { name: /采样网格相位/ }).fill("0.75");
  await page.getByRole("tab", { name: /颜色差异图/ }).click();

  const reset = page.locator('section[aria-labelledby="source-heading"] button');
  await expect(reset).toHaveCount(1);
  await expect(reset).toHaveText("恢复初始情境");
  await reset.click();
  await expect(sampling).toHaveValue("25");
  await expect(page.getByRole("slider", { name: /采样网格相位/ })).toHaveValue("0.5");
  await expect(page.getByRole("slider", { name: /颜色位深/ })).toHaveValue("2");
  await expect(page.getByRole("tab", { name: /编码表示/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expectSourceIdentity(page, "兼容样例", "平滑色彩渐变");
  await expect(legacyTask).not.toContainText(/证据已出现/);

  const worksheet = page.locator("details.mission-card");
  const worksheetSummary = worksheet.locator(":scope > summary");
  await expect(worksheet).not.toHaveAttribute("open");
  await worksheetSummary.click();
  await expect(worksheet).toHaveAttribute("open", "");
  await expect(worksheet.locator(".mission-item")).toHaveCount(10);
  await expect(worksheet.locator("details")).toHaveCount(0);

  const task = page
    .locator(".mission-item")
    .filter({ hasText: /空间采样/ })
    .first();
  await expect(task).toBeVisible();
  await expect(task.locator("details")).toHaveCount(0);
  await expect(task).toContainText(/调到 25% 左右/);

  await page.getByRole("slider", { name: /空间采样/ }).press("ArrowLeft");
  const evidenceBefore = await task.textContent();
  await expect(task).toContainText(/证据已出现/);
  await expect(task).toContainText(/仍需学生记录、描述、计算或解释/);
  expect(await task.textContent()).toBe(evidenceBefore);

  await worksheetSummary.focus();
  await expect(worksheetSummary).toBeFocused();
  await worksheetSummary.press("Space");
  await expect(worksheet).not.toHaveAttribute("open");
  await worksheetSummary.press("Enter");
  await expect(worksheet).toHaveAttribute("open", "");
});
