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

  const task = page
    .locator(".mission-item details")
    .filter({ hasText: /空间采样/ })
    .first();
  const summary = task.locator("summary");
  await expect(task).toBeVisible();
  await expect(task).not.toHaveAttribute("open");

  await page.getByRole("slider", { name: /空间采样/ }).press("ArrowLeft");
  const evidenceBefore = await task.textContent();
  await summary.focus();
  await expect(summary).toBeFocused();

  await summary.press("Enter");
  await expect(task).toHaveAttribute("open", "");
  await expect(task.locator("p").first()).toBeVisible();
  expect(await task.textContent()).toBe(evidenceBefore);

  await summary.press("Space");
  await expect(task).not.toHaveAttribute("open");
  expect(await task.textContent()).toBe(evidenceBefore);
});
