import { expect, test } from "@playwright/test";

test("traces fixed queries, provenance, and the broken foreign key", async ({ page }) => {
  await page.goto("labs/relational-data", { waitUntil: "networkidle" });

  await expect(page.getByRole("main", { name: "关系数据 workspace" })).toBeVisible();
  await page.getByRole("spinbutton", { name: /row count/i }).fill("4");
  await page.getByRole("button", { name: "Record prediction" }).click();
  await page.getByRole("button", { name: "Run to end" }).click();

  await expect(page.getByRole("region", { name: /selected relational evidence/i })).toContainText(
    /Loans per borrower/,
  );
  await expect(
    page.getByRole("table", { name: /constraint checks over the catalog/i }),
  ).toContainText(/FAIL/);
  await expect(
    page.getByRole("table", { name: /provenance: which source rows produced each result/i }),
  ).toContainText(/loan-1, person-1, book-3/);
  await expect(
    page.getByRole("table", { name: /provenance: which source rows produced each result/i }),
  ).toContainText(/loan-4, person-3, book-1/);
  const borrowers = page.getByRole("table", {
    name: /borrower source rows: NULL versus empty string/i,
  });
  await expect(borrowers).toContainText("NULL");
  await expect(borrowers).toContainText('""');
  await expect(page.getByText(/IS NOT NULL.*rejects only NULL/i)).toBeVisible();

  const query2 = page.getByRole("button", { name: /Query 2, Available books, 2 rows/i });
  await query2.focus();
  await page.keyboard.press("Enter");
  await expect(query2).toHaveAttribute("aria-current", "true");
});

test.describe("responsive evidence", () => {
  test.use({ viewport: { width: 520, height: 900 } });

  test("keeps result and constraint tables usable on a narrow viewport", async ({ page }) => {
    await page.goto("labs/relational-data", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Step" }).click();
    await expect(page.getByRole("table", { name: /query result rows/i })).toBeVisible();
    await expect(page.getByRole("region", { name: /relational constraints/i })).toBeVisible();
  });
});
