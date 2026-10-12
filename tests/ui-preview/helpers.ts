import { expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

/** PNG IHDR height: 8-byte signature, length(4) + "IHDR"(4), then width(4), height(4). */
export async function pngHeight(path: string): Promise<number> {
  return (await readFile(path)).readUInt32BE(20);
}

/**
 * The preview iframe resizes to its document: poll until the styled height
 * converges to the frame's scrollHeight. Every scene switch remounts the
 * frame, so sync must be re-asserted per scene before capturing.
 */
export async function expectFrameHeightSynced(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const scroll = await page.locator("iframe").evaluate((el) => {
        const iframe = el as HTMLIFrameElement;
        return iframe.contentDocument?.documentElement.scrollHeight ?? 0;
      });
      const styled = await page
        .locator("iframe")
        .evaluate((el) => Number.parseFloat((el as HTMLIFrameElement).style.height) || 0);
      return scroll > 0 && styled === scroll;
    })
    .toBe(true);
}

/**
 * Full-page capture covering the whole scroll height, including the
 * auto-sized frame; the PNG must be at least as tall as the document.
 */
export async function fullPageShot(page: Page, path: string): Promise<void> {
  const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.screenshot({ path, fullPage: true });
  expect(await pngHeight(path)).toBeGreaterThanOrEqual(docHeight);
}
