import { expect, test } from "@playwright/test";

test.describe("Sound reference trajectories", () => {
  test("plays original and reconstructed A/B through the visual transport", async ({ page }) => {
    await page.goto("labs/audio-encoding?source=pure440&sampleRate=8000&bitDepth=8", {
      waitUntil: "networkidle",
    });

    const plot = page.getByRole("img", { name: /plot/i });
    const cursor = page.locator("#sound-cursor");
    await expect(page.getByRole("button", { name: /^original$/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: /^play$/i }).click();
    await expect(page.getByTestId("sound-audio-status")).toContainText(
      /playing|visual-only|audio unavailable|active/i,
    );

    await page.getByRole("button", { name: /^reconstructed$/i }).click();
    await expect(page.getByRole("button", { name: /^reconstructed$/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(plot.locator(".sound-reconstructed-line")).toBeVisible();
    const seekTarget = 250;
    await page.locator("#sound-cursor").fill(String(seekTarget));
    await expect
      .poll(async () => Number(await cursor.inputValue()))
      .toBeGreaterThanOrEqual(seekTarget);
    const cursorAfterSeek = Number(await cursor.inputValue());
    await page.getByRole("button", { name: /advance 100 ms/i }).click();
    await expect
      .poll(async () => Number(await cursor.inputValue()))
      .toBeGreaterThan(cursorAfterSeek);
    await page.getByRole("button", { name: /^stop$/i }).click();
    await expect(cursor).toHaveValue("0");
  });

  test("explores window, sample-rate crossings, samples, and bounded levels", async ({ page }) => {
    await page.goto(
      "labs/audio-encoding?source=speech&sampleRate=16000&bitDepth=4&phase=0.25&view=samples",
      { waitUntil: "networkidle" },
    );

    const plot = page.getByRole("img", { name: /samples plot/i });
    await expect(plot).toHaveAttribute("data-evidence", "samples");
    const initialWindow = await plot.getAttribute("data-time-window-end");
    await page.locator("#sound-plot-periods").selectOption("1");
    await expect(plot).not.toHaveAttribute("data-time-window-end", initialWindow ?? "");
    const markers = page.locator(".sound-sample-marker");
    await expect(markers.first()).toBeVisible();
    expect(await markers.count()).toBeLessThanOrEqual(160);
    await expect(markers.first()).toHaveAttribute("data-sample-index", "0");

    await page.getByRole("button", { name: /^quantization$/i }).click();
    await page.getByRole("button", { name: /^levels$/i }).click();
    await expect(page.getByTestId("sound-quantization-evidence")).toBeVisible();
    await expect(page.locator("[data-level-count]")).toHaveAttribute("data-level-count", "16");
    expect(await page.locator(".sound-level-line").count()).toBeLessThanOrEqual(24);
    await expect(page.locator("[data-level-code='0']")).toHaveAttribute("data-level-value", "-1");

    await page.getByRole("button", { name: /^error$/i }).click();
    await expect(page.getByRole("button", { name: /^error$/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator(".sound-error-line")).toBeVisible();
  });

  test("keeps zoomed sample markers and cursor in the plot's local time coordinate", async ({
    page,
  }) => {
    await page.goto("labs/audio-encoding?source=pure440&sampleRate=8000&bitDepth=8&view=samples", {
      waitUntil: "networkidle",
    });

    const plot = page.getByRole("img", { name: /samples plot/i });
    await page.locator("#sound-plot-periods").selectOption("1");
    const startMs = Number(await plot.getAttribute("data-time-window-start"));
    const endMs = Number(await plot.getAttribute("data-time-window-end"));
    expect(endMs).toBeGreaterThan(startMs);

    const markers = plot.locator(".sound-sample-marker");
    await expect(markers.first()).toBeVisible();
    const markerCount = await markers.count();
    for (let index = 0; index < markerCount; index += 1) {
      const marker = markers.nth(index);
      const timestampMs = Number(await marker.getAttribute("data-sample-timestamp-ms"));
      const cx = Number(await marker.getAttribute("cx"));
      expect(timestampMs).toBeGreaterThanOrEqual(startMs);
      expect(timestampMs).toBeLessThanOrEqual(endMs);
      expect(cx).toBeGreaterThanOrEqual(0);
      expect(cx).toBeLessThanOrEqual(100);
      expect(cx).toBeCloseTo(((timestampMs - startMs) / (endMs - startMs)) * 100, 3);
    }

    const cursor = page.locator("#sound-cursor");
    await cursor.fill(String(Math.round((startMs + endMs) / 2)));
    const cursorLine = plot.locator(".sound-cursor-line");
    await expect(cursorLine).toHaveCount(1);
    const cursorMs = Number(await cursor.inputValue());
    expect(Number(await cursorLine.getAttribute("x1"))).toBeCloseTo(
      ((cursorMs - startMs) / (endMs - startMs)) * 100,
      3,
    );

    await cursor.fill("750");
    if (await cursorLine.count()) {
      const outsideX = Number(await cursorLine.getAttribute("x1"));
      expect(outsideX === 0 || outsideX === 100).toBe(true);
    }
  });
});
