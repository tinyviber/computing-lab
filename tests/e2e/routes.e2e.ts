import { expect, test } from "@playwright/test";

const routes = [
  { path: "/", heading: /交互式计算实验/ },
  { path: "/labs/image-encoding", heading: /图像编码/ },
  { path: "/labs/audio-encoding", heading: /声音编码|ComingSoon/i },
  { path: "/labs/home-network", heading: /家庭网络配置|ComingSoon/i },
] as const;

for (const route of routes) {
  test(`preview serves ${route.path}`, async ({ page }) => {
    const failures: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));

    await page.goto(route.path, { waitUntil: "networkidle" });
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

  await page.goto("/missing-route", { waitUntil: "networkidle" });
  await expect(page.locator("h1").first()).toHaveText(/实验不存在|NotFound|404/i);
  expect(failures, failures.join("\n")).toEqual([]);
});

test("serves nested route under configured BASE_PATH", async ({ page }) => {
  const basePath = process.env.BASE_PATH?.replace(/^\/|\/$/g, "");
  test.skip(!basePath, "Set BASE_PATH to run subpath smoke test");

  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));

  await page.goto(`labs/image-encoding`, { waitUntil: "networkidle" });
  await expect(page.locator("h1").first()).toHaveText(/图像编码/);

  const imageLink = page.locator("a.lab-link", { hasText: "图像编码" });
  await expect(imageLink).toHaveCount(1);
  const isActive = await imageLink.evaluate(
    (element) =>
      element.getAttribute("aria-current") !== null || element.classList.contains("is-active"),
  );
  expect(isActive).toBe(true);

  expect(failures, failures.join("\n")).toEqual([]);
});
