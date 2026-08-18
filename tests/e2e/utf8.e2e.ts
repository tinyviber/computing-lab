import { expect, test } from "@playwright/test";

test("traces mixed Unicode scalars into UTF-8 bytes", async ({ page }) => {
  await page.goto("labs/utf8?scenario=mixed", { waitUntil: "networkidle" });

  await expect(page.getByRole("main", { name: "UTF-8 workspace" })).toBeVisible();
  await page.getByRole("combobox", { name: /next code point branch/i }).selectOption("1-byte");
  await page.getByRole("spinbutton", { name: /final byte count/i }).fill("10");
  await page.getByRole("button", { name: "Record prediction" }).click();
  await page.getByRole("button", { name: "Run to end" }).click();

  await expect(page.locator('output[aria-label="Encoded UTF-8 bytes"]')).toHaveText(
    "65 195 169 231 140 171 240 159 153 130",
  );
  await expect(page.getByRole("region", { name: /final UTF-8 result/i })).toContainText(
    /4 visible code points.*10 bytes/i,
  );

  const emoji = page.getByRole("button", { name: /Frame 4, 🙂, U\+1F642, 4-byte/i });
  await emoji.focus();
  await page.keyboard.press("Enter");
  await expect(emoji).toHaveAttribute("aria-current", "true");
});

test.describe("responsive evidence", () => {
  test.use({ viewport: { width: 520, height: 900 } });

  test("keeps byte tables and output usable on a narrow viewport", async ({ page }) => {
    await page.goto("labs/utf8?scenario=emoji", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Step" }).click();
    await expect(page.getByRole("table", { name: /bytes produced by frame/i })).toBeVisible();
    await expect(page.locator('output[aria-label="Encoded UTF-8 bytes"]')).toBeVisible();
  });
});
