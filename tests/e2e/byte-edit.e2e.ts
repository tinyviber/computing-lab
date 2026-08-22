import { expect, test } from "@playwright/test";

test("edits one byte and reads the exact validity rule", async ({ page }) => {
  await page.goto("labs/byte-edit", { waitUntil: "networkidle" });

  await expect(page.getByRole("main", { name: "字节编辑实验区" })).toBeVisible();
  await page.getByRole("combobox", { name: /字节索引/ }).selectOption("2");
  await page.getByRole("spinbutton", { name: /新值/ }).fill("65");
  await page.getByRole("button", { name: "应用编辑" }).click();

  await expect(page.getByRole("region", { name: /选中字节编辑结果/ })).toContainText(
    /无效：第 2 个字节被拒绝（无效延续字节；问题字节 0x41）。/,
  );
  await expect(page.getByRole("list", { name: "编辑后的字节 tiles" })).toBeVisible();
  await expect(page.getByRole("region", { name: /选中字节编辑结果/ })).toContainText(
    /exact original 仍有差异/,
  );

  await page.getByRole("button", { name: "代理项" }).click();
  await expect(page.getByRole("region", { name: /当前字节序列/ })).toContainText(/代理码点/);
});

test("diagnoses truncated and overlong sequences while exact repair stays informational", async ({
  page,
}) => {
  await page.goto("labs/byte-edit", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "截断序列" }).click();
  await expect(page.getByRole("region", { name: /选中字节编辑结果/ })).toContainText(
    /缺少后续字节/,
  );
  await expect(page.getByRole("region", { name: /选中字节编辑结果/ })).toContainText(/长度不同/);
  await page.getByRole("button", { name: "过长编码 A" }).click();
  await expect(page.getByRole("region", { name: /选中字节编辑结果/ })).toContainText(/过长编码/);
  await page.getByRole("button", { name: "原始序列" }).click();
  await expect(page.getByRole("region", { name: /选中字节编辑结果/ })).toContainText(
    /exact original 完全一致/,
  );
  await expect(page.getByRole("button", { name: /bit|nibble|submit|score|run-all/i })).toHaveCount(
    0,
  );
});

test.describe("responsive evidence", () => {
  test.use({ viewport: { width: 520, height: 900 } });

  test("keeps rule evidence usable on a narrow viewport", async ({ page }) => {
    await page.goto("labs/byte-edit?scenario=mixed", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "过长编码 A" }).click();
    await expect(page.getByRole("region", { name: /选中字节编辑结果/ })).toBeVisible();
    await expect(page.getByRole("region", { name: /当前字节序列/ })).toContainText(/过长编码/);
  });
});
