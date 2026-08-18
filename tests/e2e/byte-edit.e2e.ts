import { expect, test } from "@playwright/test";

test("edits one byte and reads the exact validity rule", async ({ page }) => {
  await page.goto("labs/byte-edit", { waitUntil: "networkidle" });

  await expect(page.getByRole("main", { name: "字节编辑 workspace" })).toBeVisible();
  await page.getByRole("combobox", { name: /字节索引/ }).selectOption("2");
  await page.getByRole("spinbutton", { name: /新值/ }).fill("65");
  await page.getByRole("button", { name: "应用编辑" }).click();

  await expect(page.getByRole("region", { name: /选中字节编辑证据/ })).toContainText(
    /无效：第 2 个字节被拒绝（无效延续字节；问题字节 0x41）。/,
  );

  await page.getByRole("button", { name: "代理项" }).click();
  await expect(page.getByRole("region", { name: /当前字节序列/ })).toContainText(/代理码点/);
});

test.describe("responsive evidence", () => {
  test.use({ viewport: { width: 520, height: 900 } });

  test("keeps rule evidence usable on a narrow viewport", async ({ page }) => {
    await page.goto("labs/byte-edit?scenario=accent", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "过长编码 A" }).click();
    await expect(page.getByRole("region", { name: /选中字节编辑证据/ })).toBeVisible();
    await expect(page.getByRole("region", { name: /当前字节序列/ })).toContainText(/过长编码/);
  });
});
