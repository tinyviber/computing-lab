import { expect, test } from "@playwright/test";

test("traces variable mutation and the final false loop condition", async ({ page }) => {
  await page.goto("labs/program-execution?fixture=sum-1-to-3", { waitUntil: "networkidle" });

  await expect(page.getByRole("main", { name: "程序执行 workspace" })).toBeVisible();
  await page.getByRole("spinbutton", { name: /predicted output/i }).fill("6");
  await page.getByRole("button", { name: "Record prediction" }).click();

  for (let index = 0; index < 5; index += 1) {
    await page.getByRole("button", { name: "Step" }).click();
  }
  await page.getByRole("button", { name: "Inspect variable change" }).click();
  await expect(page.getByRole("region", { name: /selected frame evidence/i })).toContainText(
    /total:.*0.*1/i,
  );

  await page.getByRole("button", { name: "Run to end" }).click();
  await page.getByRole("button", { name: "Inspect loop stop" }).click();
  await expect(page.getByRole("region", { name: /selected frame evidence/i })).toContainText(
    /4 <= 3.*false/i,
  );
  await expect(page.getByRole("status", { name: /program output/i })).toHaveText("6");
  await expect(page.getByText(/prediction: 6; observed: 6/i)).toBeVisible();

  await page.getByRole("button", { name: /Frame 13, line 7, print/i }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /Frame 13, line 7, print/i })).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test.describe("responsive evidence", () => {
  test.use({ viewport: { width: 520, height: 900 } });

  test("keeps source, controls, table, and output evidence usable on a narrow viewport", async ({
    page,
  }) => {
    await page.goto("labs/program-execution?fixture=zero-iterations", { waitUntil: "networkidle" });

    await expect(page.getByRole("main", { name: "程序执行 workspace" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Program source" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Step" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Run to end" })).toBeVisible();
    await expect(page.getByRole("table", { name: /initial variables/i })).toBeVisible();
    await expect(page.getByRole("status", { name: /program output/i })).toHaveText("—");
  });
});
