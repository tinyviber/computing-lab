import { expect, test } from "@playwright/test";

test("traces fixed queries, provenance, and the catalog rules", async ({ page }) => {
  await page.goto("labs/relational-data", { waitUntil: "networkidle" });

  await expect(page.getByRole("main", { name: "关系数据实验区" })).toBeVisible();
  await page.getByRole("spinbutton", { name: /行数/ }).fill("4");
  await page.getByRole("button", { name: "记录预测" }).click();
  await page.getByRole("button", { name: "运行到结束" }).click();

  await expect(page.getByRole("region", { name: /当前关系数据结果/ })).toContainText(
    /按借阅人统计借阅数/,
  );
  await expect(page.getByRole("table", { name: /固定目录上的约束检查/ })).toContainText(/失败/);
  await expect(page.getByRole("table", { name: /哪些原始记录产生了每条结果/ })).toContainText(
    /loan-1, person-1, book-3/,
  );
  await expect(page.getByRole("table", { name: /哪些原始记录产生了每条结果/ })).toContainText(
    /loan-4, person-3, book-1/,
  );
  const borrowers = page.getByRole("table", {
    name: /借阅人源行：NULL 与空字符串的对照/,
  });
  await expect(borrowers).toContainText("NULL");
  await expect(borrowers).toContainText('""');
  await expect(page.getByText(/borrowers\.name 不是 NULL/)).toBeVisible();

  const query2 = page.getByRole("button", { name: /查询 2：可借图书，2 行/ });
  await query2.focus();
  await page.keyboard.press("Enter");
  await expect(query2).toHaveAttribute("aria-current", "true");
});

test.describe("responsive evidence", () => {
  test.use({ viewport: { width: 520, height: 900 } });

  test("keeps result and constraint tables usable on a narrow viewport", async ({ page }) => {
    await page.goto("labs/relational-data", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "执行一步" }).click();
    await expect(page.getByRole("table", { name: /查询结果行/ })).toBeVisible();
    await expect(page.getByRole("region", { name: /关系数据约束/ })).toBeVisible();
  });
});
