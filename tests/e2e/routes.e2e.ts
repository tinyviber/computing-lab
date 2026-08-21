import { expect, test } from "@playwright/test";

const routes = [
  { path: ".", heading: /交互式计算实验/ },
  { path: "labs/image-encoding", heading: /图像编码/ },
  { path: "labs/audio-encoding", heading: /声音编码|ComingSoon/i },
  { path: "labs/home-network", heading: /家庭网络探针/ },
] as const;

for (const route of routes) {
  test(`preview serves ${route.path}`, async ({ page }) => {
    const failures: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
    const response = await page.goto(route.path, { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1").first()).toHaveText(route.heading);
    if (route.path === "labs/image-encoding") {
      await expect(page.getByRole("slider", { name: /空间采样/ })).toBeVisible();
      await expect(page.getByRole("img", { name: /重建图像/ })).toBeVisible();
    }
    if (route.path === "labs/home-network") {
      await expect(page.getByRole("button", { name: /发送探针/ })).toBeVisible();
      await expect(page.getByRole("region", { name: /事件链/i })).toBeVisible();
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
}

test("preview renders not-found route", async ({ page }) => {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  const response = await page.goto("missing-route", { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1").first()).toHaveText(/实验不存在|NotFound|404/i);
  expect(failures, failures.join("\n")).toEqual([]);
});

test("hydrates a direct query for every lesson", async ({ page }) => {
  await page.goto("labs/image-encoding?image=checkerboard&sample=25&phase=0.5&bits=2", {
    waitUntil: "networkidle",
  });
  await expect(page.getByRole("slider", { name: /空间采样/ })).toHaveValue("25");
  await expect(page.getByRole("slider", { name: /颜色位深/ })).toHaveValue("2");

  await page.goto("labs/audio-encoding?source=high-pulse&sampleRate=16000&bitDepth=12", {
    waitUntil: "networkidle",
  });
  await expect(page.getByLabel(/采样频率/)).toHaveValue("16000");
  await expect(page.getByLabel(/量化位数/)).toHaveValue("12");

  await page.goto("labs/home-network?scenario=wrong-gateway", { waitUntil: "networkidle" });
  await expect(page.locator("h1").first()).toHaveText("家庭网络探针");
  await expect(page.getByRole("button", { name: /发送探针/ })).toBeVisible();
  await page.getByRole("button", { name: /发送探针/ }).click();
  await expect(page.getByRole("region", { name: /事件链/i })).toContainText(
    /gateway-unresolved|gateway|arp/i,
  );
});

test("changes image encoding parameters through keyboard controls", async ({ page }) => {
  await page.goto("labs/image-encoding", { waitUntil: "networkidle" });

  const sampling = page.getByRole("slider", { name: /空间采样/ });
  await sampling.press("ArrowLeft");
  await expect(sampling).toHaveValue("45");

  const bitDepth = page.getByRole("slider", { name: /颜色位深/ });
  await bitDepth.press("ArrowDown");
  await bitDepth.press("ArrowDown");
  await expect(bitDepth).toHaveValue("2");
});

test("navigates between labs with SPA links and restores back/forward state", async ({ page }) => {
  await page.goto(".", { waitUntil: "networkidle" });
  await page
    .getByRole("link", { name: /图像编码/ })
    .first()
    .click();
  await expect(page.locator("h1").first()).toHaveText(/图像编码/);
  await page.locator("a.lab-link", { hasText: "声音编码" }).click();
  await expect(page.locator("h1").first()).toHaveText(/声音编码/);
  await page.locator("a.lab-link", { hasText: "家庭网络配置" }).click();
  await expect(page.locator("h1").first()).toHaveText(/家庭网络探针/);
  await expect(page.getByRole("button", { name: /发送探针/ })).toBeVisible();
  await page.goBack();
  await expect(page.locator("h1").first()).toHaveText(/声音编码/);
  await page.goForward();
  await expect(page.locator("h1").first()).toHaveText(/家庭网络探针/);
});

test("changes same-route image search through browser navigation and restores it", async ({
  page,
}) => {
  await page.goto("labs/image-encoding?image=checkerboard&sample=25&bits=2", {
    waitUntil: "networkidle",
  });
  await expect(page.getByRole("slider", { name: /空间采样/ })).toHaveValue("25");
  await page.goto("labs/image-encoding?image=gradient&sample=75&bits=6", {
    waitUntil: "networkidle",
  });
  await expect(page.getByRole("slider", { name: /空间采样/ })).toHaveValue("75");
  await expect(page.getByRole("slider", { name: /颜色位深/ })).toHaveValue("6");
  await page.goBack();
  await expect(page.getByRole("slider", { name: /空间采样/ })).toHaveValue("25");
  await page.goForward();
  await expect(page.getByRole("slider", { name: /空间采样/ })).toHaveValue("75");
});

test("serves a base-prefixed deep link with history fallback", async ({ page }) => {
  const response = await page.goto("labs/image-encoding?image=checkerboard&sample=25", {
    waitUntil: "networkidle",
  });
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1").first()).toHaveText(/图像编码/);
  const imageLink = page.locator("a.lab-link", { hasText: "图像编码" });
  await expect(imageLink).toHaveCount(1);
  await expect(imageLink).toHaveClass(/is-active/);
});
