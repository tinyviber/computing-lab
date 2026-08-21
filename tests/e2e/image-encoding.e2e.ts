import { expect, test } from "@playwright/test";

test("loads the photo scenario without external network or image dependencies", async ({
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

  await page.goto("labs/image-encoding?image=photo&sample=25&bits=2", {
    waitUntil: "networkidle",
  });
  expect(nonLocalRequests).toEqual([]);
  await expect(page.locator("h1").first()).toHaveText(/图像编码/);
  await expect(page.getByRole("img", { name: /原始源图像/ })).toHaveAttribute("width", "48");
  await expect(page.getByRole("img", { name: /原始源图像/ })).toHaveAttribute("height", "32");

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
