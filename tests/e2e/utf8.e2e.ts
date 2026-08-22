import { expect, test } from "@playwright/test";

test("traces mixed Unicode scalars into UTF-8 bytes", async ({ page }) => {
  await page.goto("labs/utf8?scenario=mixed", { waitUntil: "networkidle" });

  await expect(page.getByRole("main", { name: "UTF-8 编码实验区" })).toBeVisible();
  await page.getByRole("button", { name: "运行到结束" }).click();

  await expect(page.locator('output[aria-label="编码后的 UTF-8 字节"]')).toHaveText(
    "65 195 169 231 140 171 240 159 153 130",
  );
  await expect(page.getByRole("region", { name: /最终 UTF-8 结果/ })).toContainText(
    /4 个可见码点.*10 个字节/,
  );

  const emoji = page.getByRole("button", { name: /第 4 个步骤，🙂，U\+1F642，4 字节/ });
  await emoji.focus();
  await page.keyboard.press("Enter");
  await expect(emoji).toHaveAttribute("aria-current", "true");
});

test("shows exact learner-facing evidence for every UTF-8 branch boundary", async ({ page }) => {
  const boundaries = [
    {
      scenario: "boundary-1-2",
      frames: [
        { codePoint: "U+007F", branch: "1 字节", template: "0xxxxxxx", bytes: "127" },
        {
          codePoint: "U+0080",
          branch: "2 字节",
          template: "110xxxxx 10xxxxxx",
          bytes: "194 128",
        },
      ],
      output: "127 194 128",
    },
    {
      scenario: "boundary-2-3",
      frames: [
        {
          codePoint: "U+07FF",
          branch: "2 字节",
          template: "110xxxxx 10xxxxxx",
          bytes: "223 191",
        },
        {
          codePoint: "U+0800",
          branch: "3 字节",
          template: "1110xxxx 10xxxxxx 10xxxxxx",
          bytes: "224 160 128",
        },
      ],
      output: "223 191 224 160 128",
    },
    {
      scenario: "boundary-3-4",
      frames: [
        {
          codePoint: "U+FFFF",
          branch: "3 字节",
          template: "1110xxxx 10xxxxxx 10xxxxxx",
          bytes: "239 191 191",
        },
        {
          codePoint: "U+10000",
          branch: "4 字节",
          template: "11110xxx 10xxxxxx 10xxxxxx 10xxxxxx",
          bytes: "240 144 128 128",
        },
      ],
      output: "239 191 191 240 144 128 128",
    },
  ] as const;

  for (const boundary of boundaries) {
    await page.goto(`labs/utf8?scenario=${boundary.scenario}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "运行到结束" }).click();

    await expect(page.locator('output[aria-label="编码后的 UTF-8 字节"]')).toHaveText(
      boundary.output,
    );
    for (const frame of boundary.frames) {
      const step = page.getByRole("button", {
        name: new RegExp(frame.codePoint.replace("+", "\\+")),
      });
      await step.focus();
      await page.keyboard.press("Enter");
      await expect(step).toHaveAttribute("aria-current", "true");
      const evidence = page.getByRole("region", { name: /选中 UTF-8 结果/ });
      await expect(evidence).toContainText(frame.codePoint);
      await expect(evidence).toContainText(frame.branch);
      await expect(evidence).toContainText(frame.template);
      await expect(evidence).toContainText(frame.bytes);
    }
  }
});

test.describe("responsive evidence", () => {
  test.use({ viewport: { width: 520, height: 900 } });

  test("keeps byte tables and output usable on a narrow viewport", async ({ page }) => {
    await page.goto("labs/utf8?scenario=emoji", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "执行一步" }).click();
    await expect(page.getByRole("table", { name: /生成的字节/ })).toBeVisible();
    await expect(page.locator('output[aria-label="编码后的 UTF-8 字节"]')).toBeVisible();
  });
});
