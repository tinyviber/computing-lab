import { expect, test, type Page } from "@playwright/test";

const routes = [
  { path: ".", heading: /计算实验室/ },
  { path: "labs/image-encoding?showExperimentalLabs=1", heading: /AI 修复老照片/ },
  { path: "labs/audio-encoding?showExperimentalLabs=1", heading: /声音编码|ComingSoon/i },
  { path: "labs/home-network?showExperimentalLabs=1", heading: /家庭网络探针/ },
] as const;

// The static preview has no API backend, so the auth session probe to /api/*
// legitimately 404s. Collect every other console/page error but that one.
function collectFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const url = message.location()?.url ?? "";
    if (new URL(url, "http://localhost").pathname.startsWith("/api/")) return;
    failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  return failures;
}

for (const route of routes) {
  test(`preview serves ${route.path}`, async ({ page }) => {
    const failures = collectFailures(page);
    const response = await page.goto(route.path, { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1").first()).toHaveText(route.heading);
    if (route.path === "labs/image-encoding?showExperimentalLabs=1") {
      await expect(page.getByRole("heading", { name: /约定决定 bit 的意义/ })).toBeVisible();
      await expect(page.getByRole("textbox", { name: /高亮行的 16 bit/ })).toBeVisible();
    }
    if (route.path === "labs/home-network?showExperimentalLabs=1") {
      await expect(page.getByRole("button", { name: /发送探针/ })).toBeVisible();
      await expect(page.getByRole("region", { name: /事件链/i })).toBeVisible();
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
}

test("preview renders not-found route", async ({ page }) => {
  const failures = collectFailures(page);
  const response = await page.goto("missing-route", { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1").first()).toHaveText(/实验不存在|NotFound|404/i);
  expect(failures, failures.join("\n")).toEqual([]);
});

test("hydrates a direct query for every lesson", async ({ page }) => {
  await page.goto(
    "labs/image-encoding?stage=2&image=checkerboard&res=25&colors=palette2&showExperimentalLabs=1",
    {
      waitUntil: "networkidle",
    },
  );
  await expect(page.getByRole("button", { name: "25%", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "4 色", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.goto(
    "labs/audio-encoding?source=high-pulse&sampleRate=16000&bitDepth=12&showExperimentalLabs=1",
    {
      waitUntil: "networkidle",
    },
  );
  await expect(page.getByLabel(/采样频率/)).toHaveValue("16000");
  await expect(page.getByLabel(/量化位数/)).toHaveValue("12");

  await page.goto("labs/home-network?scenario=wrong-gateway&showExperimentalLabs=1", {
    waitUntil: "networkidle",
  });
  await expect(page.locator("h1").first()).toHaveText("家庭网络探针");
  await expect(page.getByRole("button", { name: /发送探针/ })).toBeVisible();
  await page.getByRole("button", { name: /发送探针/ }).click();
  await expect(page.getByRole("region", { name: /事件链/i })).toContainText(
    /gateway-unresolved|gateway|arp/i,
  );
});

test("types the row encoding through keyboard controls", async ({ page }) => {
  await page.goto("labs/image-encoding?showExperimentalLabs=1", { waitUntil: "networkidle" });

  const bits = page.getByRole("textbox", { name: /高亮行的 16 bit/ });
  await bits.pressSequentially("0111010101011001");
  await expect(bits).toHaveValue("0111010101011001");
  await page.getByRole("button", { name: "检查编码" }).click();
  await expect(page.locator(".stage-feedback")).toContainText("通过");
});

test("navigates between labs with SPA links and restores back/forward state", async ({ page }) => {
  // The static preview serves anonymous sessions; the experimental flag opens
  // hidden labs and the rail preserves it across navigation.
  await page.goto("labs/image-encoding?showExperimentalLabs=1", { waitUntil: "networkidle" });
  await expect(page.locator("h1").first()).toHaveText(/AI 修复老照片/);
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
  await page.goto(
    "labs/image-encoding?stage=2&image=checkerboard&res=25&colors=palette2&showExperimentalLabs=1",
    {
      waitUntil: "networkidle",
    },
  );
  await expect(page.getByRole("button", { name: "25%", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goto(
    "labs/image-encoding?stage=2&image=gradient&res=50&colors=palette8&showExperimentalLabs=1",
    {
      waitUntil: "networkidle",
    },
  );
  await expect(page.getByRole("button", { name: "50%", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "256 色", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goBack();
  await expect(page.getByRole("button", { name: "25%", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goForward();
  await expect(page.getByRole("button", { name: "50%", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("serves a base-prefixed deep link with history fallback", async ({ page }) => {
  const response = await page.goto(
    "labs/image-encoding?image=checkerboard&sample=25&showExperimentalLabs=1",
    {
      waitUntil: "networkidle",
    },
  );
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1").first()).toHaveText(/AI 修复老照片/);
  const imageLink = page.locator("a.lab-link", { hasText: "图像编码" });
  await expect(imageLink).toHaveCount(1);
  await expect(imageLink).toHaveClass(/is-active/);
});
