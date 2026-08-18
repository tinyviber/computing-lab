import { expect, test } from "@playwright/test";

test("edits one byte and reads the exact validity rule", async ({ page }) => {
  await page.goto("labs/byte-edit", { waitUntil: "networkidle" });

  await expect(page.getByRole("main", { name: "字节编辑 workspace" })).toBeVisible();
  await page.getByRole("combobox", { name: /byte index/i }).selectOption("2");
  await page.getByRole("spinbutton", { name: /new value/i }).fill("65");
  await page.getByRole("button", { name: "Apply edit" }).click();

  await expect(page.getByRole("region", { name: /selected byte edit evidence/i })).toContainText(
    /Invalid at byte 2: missing continuation byte/,
  );

  await page.getByRole("button", { name: "Surrogate" }).click();
  await expect(page.getByRole("region", { name: /current byte sequence/i })).toContainText(
    /surrogate code point/,
  );
});

test.describe("responsive evidence", () => {
  test.use({ viewport: { width: 520, height: 900 } });

  test("keeps rule evidence usable on a narrow viewport", async ({ page }) => {
    await page.goto("labs/byte-edit?scenario=accent", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Overlong A" }).click();
    await expect(page.getByRole("region", { name: /selected byte edit evidence/i })).toBeVisible();
    await expect(page.getByRole("region", { name: /current byte sequence/i })).toContainText(
      /overlong encoding/,
    );
  });
});
