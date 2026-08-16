import { expect, test } from "@playwright/test";

const routes = [
  { path: ".", heading: /交互式计算实验/ },
  { path: "labs/image-encoding", heading: /图像编码/ },
  { path: "labs/audio-encoding", heading: /声音编码|ComingSoon/i },
  { path: "labs/home-network", heading: /家庭网络配置|ComingSoon/i },
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
  await page.goto("labs/image-encoding?scenario=low-sampling", { waitUntil: "networkidle" });
  await expect(page.getByRole("slider", { name: /density/i })).toHaveValue("2");

  await page.goto("labs/audio-encoding?scenario=low-frequency", { waitUntil: "networkidle" });
  await expect(page.getByRole("slider", { name: /sampling rate/i })).toHaveValue("8");

  await page.goto("labs/home-network?scenario=wrong-gateway", { waitUntil: "networkidle" });
  await expect(page.getByRole("combobox", { name: /default gateway/i })).toHaveValue(
    "192.168.1.254",
  );
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
  await expect(page.locator("h1").first()).toHaveText(/家庭网络配置/);

  await page.goBack();
  await expect(page.locator("h1").first()).toHaveText(/声音编码/);
  await page.goForward();
  await expect(page.locator("h1").first()).toHaveText(/家庭网络配置/);
});

test("changes same-route search through browser navigation and restores it", async ({ page }) => {
  await page.goto("labs/image-encoding?scenario=low-sampling", { waitUntil: "networkidle" });
  await expect(page.getByRole("slider", { name: /density/i })).toHaveValue("2");

  await page.goto("labs/image-encoding?scenario=high-quantization", { waitUntil: "networkidle" });
  await expect(page.getByRole("slider", { name: /density/i })).toHaveValue("8");
  await expect(page.getByRole("slider", { name: /bits/i })).toHaveValue("2");

  await page.goBack();
  await expect(page.getByRole("slider", { name: /density/i })).toHaveValue("2");
  await page.goForward();
  await expect(page.getByRole("slider", { name: /density/i })).toHaveValue("8");
});

test("serves a base-prefixed deep link with history fallback", async ({ page }) => {
  const response = await page.goto("labs/image-encoding?scenario=low-sampling", {
    waitUntil: "networkidle",
  });
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1").first()).toHaveText(/图像编码/);

  const imageLink = page.locator("a.lab-link", { hasText: "图像编码" });
  await expect(imageLink).toHaveCount(1);
  await expect(imageLink).toHaveClass(/is-active/);
});
