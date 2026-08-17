import { expect, test } from "@playwright/test";

test.describe("Sound reference trajectories", () => {
  test("plays original and reconstructed A/B through the visual transport", async ({ page }) => {
    await page.goto("labs/audio-encoding?source=pure440&sampleRate=8000&bitDepth=8", {
      waitUntil: "networkidle",
    });

    const plot = page.getByRole("img", { name: /plot/i });
    const cursor = page.locator("#sound-cursor");
    const initialCursor = Number(await cursor.inputValue());
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
    await page.getByRole("button", { name: /advance 100 ms/i }).click();
    await expect.poll(async () => Number(await cursor.inputValue())).toBeGreaterThan(initialCursor);
    await page.getByRole("button", { name: /^stop$/i }).click();
    await expect(cursor).toHaveValue("0");
  });

  test("shows real samples, complete levels, and bounded error evidence", async ({ page }) => {
    await page.goto(
      "labs/audio-encoding?source=speech&sampleRate=16000&bitDepth=4&phase=0.25&view=samples",
      { waitUntil: "networkidle" },
    );

    const plot = page.getByRole("img", { name: /samples plot/i });
    await expect(plot).toHaveAttribute("data-evidence", "samples");
    const markers = page.locator(".sound-sample-marker");
    await expect(markers.first()).toBeVisible();
    expect(await markers.count()).toBeLessThanOrEqual(160);
    await expect(markers.first()).toHaveAttribute("data-sample-index", "0");

    await page.getByRole("button", { name: /^quantization$/i }).click();
    await page.getByRole("button", { name: /^levels$/i }).click();
    await expect(page.getByTestId("sound-quantization-evidence")).toBeVisible();
    await expect(page.locator("[data-level-count]")).toHaveAttribute("data-level-count", "16");
    expect(await page.locator(".sound-level-line").count()).toBeLessThanOrEqual(24);

    await page.getByRole("button", { name: /^error$/i }).click();
    await expect(page.getByRole("button", { name: /^error$/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator(".sound-error-line")).toBeVisible();
  });

  test("uses component evidence for aliasing and separate quantization mode evidence", async ({
    page,
  }) => {
    await page.goto("labs/audio-encoding?source=speech&sampleRate=840&bitDepth=4&mode=aliasing", {
      waitUntil: "networkidle",
    });

    await expect(page.locator(".sound-mode-evidence")).toHaveAttribute(
      "data-sound-mode",
      "aliasing",
    );
    const aliasingEvidence = page.getByTestId("sound-aliasing-evidence");
    await expect(aliasingEvidence).toBeVisible();
    const evidenceTable = aliasingEvidence.getByRole("table");
    await expect(evidenceTable).toContainText("180 Hz");
    await expect(evidenceTable).toContainText("420 Hz");
    await expect(evidenceTable).toContainText("780 Hz");
    await expect(aliasingEvidence.getByText(/component aliasing evidence/i)).toBeVisible();
    await expect(page.getByText(/speech-like.*below.*nyquist/i)).not.toBeVisible();

    await page.getByRole("button", { name: /^quantization$/i }).click();
    await expect(page.locator(".sound-mode-evidence")).toHaveAttribute(
      "data-sound-mode",
      "quantization",
    );
    const quantizationEvidence = page.getByTestId("sound-quantization-evidence");
    await expect(quantizationEvidence).toBeVisible();
    await expect(quantizationEvidence.getByText(/quantization evidence/i)).toBeVisible();
  });
});
