import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";

const control = (name: RegExp) => screen.getByLabelText(name);
const button = (name: RegExp) => screen.getByRole("button", { name });

describe("Sound reference UI", () => {
  it("renders native labelled controls for the orthogonal Sound state", async () => {
    await renderAppAt("/labs/audio-encoding");

    expect(screen.getByRole("main", { name: /声音编码 workspace/i })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(control(/^source$/i)).toHaveValue("pure440");
    expect(control(/sample rate/i)).toHaveValue("8000");
    expect(control(/bit depth/i)).toHaveValue("8");
    expect(control(/^phase$/i)).toHaveValue("0");

    for (const name of [/stop/i, /play/i, /pause/i, /original/i, /reconstructed/i]) {
      expect(button(name)).toBeInTheDocument();
    }
    for (const name of [
      /compare/i,
      /aliasing/i,
      /quantization/i,
      /samples/i,
      /levels/i,
      /error/i,
    ]) {
      expect(button(name)).toBeInTheDocument();
    }
  });

  it("keeps source, audition, mode, and view changes orthogonal", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding");

    await user.selectOptions(control(/^source$/i), "sawtooth");
    await user.click(button(/^original$/i));
    await user.click(button(/^aliasing$/i));
    await user.click(button(/^error$/i));

    expect(control(/^source$/i)).toHaveValue("sawtooth");
    expect(button(/^original$/i)).toHaveAttribute("aria-pressed", "true");
    expect(button(/^aliasing$/i)).toHaveAttribute("aria-pressed", "true");
    expect(button(/^error$/i)).toHaveAttribute("aria-pressed", "true");
    expect(button(/^compare$/i)).toHaveAttribute("aria-pressed", "false");
    expect(button(/^quantization$/i)).toHaveAttribute("aria-pressed", "false");
    expect(button(/^samples$/i)).toHaveAttribute("aria-pressed", "false");
    expect(button(/^levels$/i)).toHaveAttribute("aria-pressed", "false");
  });

  it("supports keyboard-labelled controls without stealing focus", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding");

    const sampleRate = control(/sample rate/i);
    sampleRate.focus();
    fireEvent.change(sampleRate, { target: { value: "16000" } });
    expect(sampleRate).toHaveFocus();
    expect(sampleRate).toHaveValue("16000");

    const source = control(/^source$/i);
    source.focus();
    await user.selectOptions(source, "high-pulse");
    expect(source).toHaveFocus();
  });

  it("exposes a bounded polite live region and bounded accessible plot", async () => {
    await renderAppAt("/labs/audio-encoding?source=high-pulse&sampleRate=48000&bitDepth=16");

    const live = screen.getByText(/High pulse; stopped/i);
    expect(live).toHaveAttribute("aria-live", "polite");
    expect((live.textContent ?? "").length).toBeLessThanOrEqual(240);

    const plot = screen.getByRole("img", { name: /sound|waveform|plot/i });
    expect(plot).toBeInTheDocument();
    expect(plot.getAttribute("aria-label")).toBeTruthy();
  });

  it("does not write live URL state while interacting with Sound controls", async () => {
    const user = userEvent.setup();
    const { history } = await renderAppAt("/labs/audio-encoding");
    const initial = history.location.href;

    await user.selectOptions(control(/^source$/i), "speech");
    await user.click(button(/^aliasing$/i));
    await user.click(button(/^error$/i));

    expect(history.location.href).toBe(initial);
  });

  it("renders real sample markers and bounded evidence for the Samples view", async () => {
    const user = userEvent.setup();
    await renderAppAt(
      "/labs/audio-encoding?source=speech&sampleRate=16000&bitDepth=8&phase=0.25&view=samples",
    );

    expect(button(/^samples$/i)).toHaveAttribute("aria-pressed", "true");
    const plot = screen.getByRole("img", { name: /samples plot/i });
    expect(button(/^samples$/i)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^samples$/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const markers = document.querySelectorAll(".sound-sample-marker");
    expect(markers.length).toBeGreaterThan(0);
    expect(markers.length).toBeLessThanOrEqual(160);
    for (const marker of markers) {
      expect(marker.getAttribute("data-sample-index")).toMatch(/^\d+$/);
    }

    await user.click(button(/^levels$/i));
    expect(screen.getByRole("button", { name: /^levels$/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps complete level values and error evidence bounded in the DOM", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding?source=sawtooth&sampleRate=48000&bitDepth=4");

    await user.click(button(/^quantization$/i));
    await user.click(button(/^levels$/i));
    const levelPreview = screen.getByTestId("sound-quantization-evidence");
    expect(levelPreview.querySelector("[data-level-count]")).toHaveAttribute(
      "data-level-count",
      "16",
    );
    expect(levelPreview.querySelectorAll(".sound-level-preview span").length).toBeLessThanOrEqual(
      24,
    );

    expect(document.querySelectorAll(".sound-level-line").length).toBeLessThanOrEqual(24);
    expect(document.querySelectorAll(".sound-sample-marker").length).toBeLessThanOrEqual(160);

    await user.click(button(/^error$/i));
    const errorPlot = screen.getByRole("img", { name: /error plot/i });
    expect(button(/^error$/i)).toHaveAttribute("aria-pressed", "true");
    expect(errorPlot.querySelector(".sound-error-line")).toBeInTheDocument();
  });

  it("renders distinct compare, aliasing, and quantization evidence without scalar composite claims", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding?source=speech&sampleRate=840&bitDepth=4");
    const plot = () => screen.getByRole("img", { name: /plot/i });

    expect(document.querySelector(".sound-mode-evidence")).toHaveAttribute(
      "data-sound-mode",
      "compare",
    );
    expect(screen.getByTestId("sound-compare-evidence")).toBeInTheDocument();
    expect(screen.queryByText(/folded frequency/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/moves sampling timestamps; source x\(t\) stays unchanged/i),
    ).toBeInTheDocument();

    await user.click(button(/^aliasing$/i));
    expect(document.querySelector(".sound-mode-evidence")).toHaveAttribute(
      "data-sound-mode",
      "aliasing",
    );
    const aliasingEvidence = screen.getByTestId("sound-aliasing-evidence");
    expect(aliasingEvidence).toBeInTheDocument();
    const evidenceTable = screen.getByRole("table");
    expect(evidenceTable).toHaveTextContent("180 Hz");
    expect(evidenceTable).toHaveTextContent("420 Hz");
    expect(evidenceTable).toHaveTextContent("780 Hz");
    expect(within(aliasingEvidence).getByText(/component aliasing evidence/i)).toBeInTheDocument();
    expect(screen.queryByText(/speech-like.*below.*nyquist/i)).not.toBeInTheDocument();

    await user.click(button(/^quantization$/i));
    expect(document.querySelector(".sound-mode-evidence")).toHaveAttribute(
      "data-sound-mode",
      "quantization",
    );
    const quantizationEvidence = screen.getByTestId("sound-quantization-evidence");
    expect(quantizationEvidence).toBeInTheDocument();
    expect(within(quantizationEvidence).getByText(/quantization evidence/i)).toBeInTheDocument();
  });

  it("keeps compare overlay and A/B audition selection as separate evidence", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding?source=pure440&sampleRate=8000&bitDepth=8");

    const plot = screen.getByRole("img", { name: /plot/i });
    expect(plot.querySelector(".sound-original-line")).toBeInTheDocument();
    expect(plot.querySelector(".sound-reconstructed-line")).toBeInTheDocument();

    await user.click(button(/^reconstructed$/i));
    expect(button(/^reconstructed$/i)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^reconstructed$/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps an arbitrary URL sample rate visible until a precise ladder stop is chosen", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding?source=pure440&sampleRate=840");

    const sampleRate = control(/sample rate/i);
    expect(sampleRate.tagName).toBe("SELECT");
    expect(sampleRate).toHaveValue("840");
    expect(
      within(sampleRate).getByRole("option", { name: /840 hz \(scenario\)/i }),
    ).toBeInTheDocument();
    expect(within(sampleRate).getByRole("option", { name: /^880 hz$/i })).toBeInTheDocument();
    const optionValues = within(sampleRate)
      .getAllByRole("option")
      .map((option) => Number((option as HTMLOptionElement).value));
    expect(optionValues).toEqual(
      expect.arrayContaining([800, 880, 960, 3600, 3960, 4320, 12000, 24000]),
    );

    await user.selectOptions(sampleRate, "880");
    expect(sampleRate).toHaveValue("880");
  });

  it("changes an explicit plot time window without increasing the bounded plot", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding?source=sawtooth&sampleRate=8000&bitDepth=8");

    const plot = screen.getByRole("img", { name: /plot/i });
    const initialEnd = plot.getAttribute("data-time-window-end");
    const initialPoints = plot.querySelectorAll(".sound-original-line circle").length;

    await user.selectOptions(screen.getByLabelText(/plot window/i), "1");
    expect(plot.getAttribute("data-time-window-end")).not.toBe(initialEnd);
    expect(plot.querySelectorAll(".sound-original-line circle").length).toBeLessThanOrEqual(360);
    expect(initialPoints).toBeLessThanOrEqual(360);
  });

  it("shows real full-range quantization codes in a bounded preview", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding?source=pure440&sampleRate=8000&bitDepth=16");
    await user.click(button(/^quantization$/i));
    await user.click(button(/^levels$/i));

    const evidence = screen.getByTestId("sound-quantization-evidence");
    const levels = evidence.querySelectorAll("[data-level-code]");
    expect(levels.length).toBeGreaterThanOrEqual(2);
    expect(levels.length).toBeLessThanOrEqual(24);
    expect(levels[0]).toHaveAttribute("data-level-code", "0");
    expect(levels[0]).toHaveAttribute("data-level-value", "-1");
    expect(levels[levels.length - 1]).toHaveAttribute("data-level-code", "65535");
    expect(levels[levels.length - 1]).toHaveAttribute("data-level-value", "1");
    expect(evidence).toHaveTextContent(/65536 (?:total levels|complete level values)/i);
  });

  it("keeps pure440 sample markers dense and aligned to dynamic local time", async () => {
    const user = userEvent.setup();
    await renderAppAt(
      "/labs/audio-encoding?source=pure440&sampleRate=8000&bitDepth=8&view=samples",
    );

    const plot = screen.getByRole("img", { name: /samples plot/i });
    await user.selectOptions(screen.getByLabelText(/plot window/i), "1");

    const startMs = Number(plot.getAttribute("data-time-window-start"));
    const endMs = Number(plot.getAttribute("data-time-window-end"));
    expect(endMs).toBeGreaterThan(startMs);

    const markers = [...plot.querySelectorAll<SVGCircleElement>(".sound-sample-marker")];
    expect(markers.length).toBeGreaterThan(1);
    for (const marker of markers) {
      const timestampMs = Number(marker.getAttribute("data-sample-timestamp-ms"));
      const cx = Number(marker.getAttribute("cx"));
      const expectedCx = ((timestampMs - startMs) / (endMs - startMs)) * 100;

      expect(timestampMs).toBeGreaterThanOrEqual(startMs);
      expect(timestampMs).toBeLessThanOrEqual(endMs);
      expect(cx).toBeGreaterThanOrEqual(0);
      expect(cx).toBeLessThanOrEqual(100);
      expect(cx).toBeCloseTo(expectedCx, 5);
    }

    const initialStart = Number(plot.getAttribute("data-time-window-start"));
    const initialEnd = Number(plot.getAttribute("data-time-window-end"));
    const cursorInput = document.querySelector("#sound-cursor") as HTMLInputElement;
    fireEvent.change(cursorInput, { target: { value: "500.25" } });

    const shiftedStart = Number(plot.getAttribute("data-time-window-start"));
    const shiftedEnd = Number(plot.getAttribute("data-time-window-end"));
    expect(shiftedStart).not.toBe(initialStart);
    expect(shiftedEnd).not.toBe(initialEnd);

    const shiftedMarkers = [...plot.querySelectorAll<SVGCircleElement>(".sound-sample-marker")];
    expect(shiftedMarkers.length).toBeGreaterThan(1);
    for (const marker of shiftedMarkers) {
      const timestampMs = Number(marker.getAttribute("data-sample-timestamp-ms"));
      const cx = Number(marker.getAttribute("cx"));
      expect(cx).toBeCloseTo(((timestampMs - shiftedStart) / (shiftedEnd - shiftedStart)) * 100, 5);
    }
  });

  it("uses sub-ms high-pulse cursor precision and keeps a distant seek centered in the plot", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/audio-encoding?source=pure440&sampleRate=8000&bitDepth=8");

    await user.selectOptions(control(/^source$/i), "high-pulse");
    const cursorInput = document.querySelector("#sound-cursor") as HTMLInputElement;
    expect(Number(cursorInput.getAttribute("step"))).toBeGreaterThan(0);
    expect(Number(cursorInput.getAttribute("step"))).toBeLessThan(1);
    expect(document.querySelector('label[for="sound-cursor"]')).toHaveTextContent(
      /\d+\.\d+\s*\/\s*1000 ms/,
    );

    const plot = screen.getByRole("img", { name: /plot/i });
    const initialStart = Number(plot.getAttribute("data-time-window-start"));
    const initialEnd = Number(plot.getAttribute("data-time-window-end"));
    fireEvent.change(cursorInput, { target: { value: "500.25" } });

    const actualCursorMs = Number(cursorInput.value);
    const shiftedStart = Number(plot.getAttribute("data-time-window-start"));
    const shiftedEnd = Number(plot.getAttribute("data-time-window-end"));
    expect(actualCursorMs).toBeCloseTo(500.25, 2);
    expect(shiftedStart).not.toBe(initialStart);
    expect(shiftedEnd).not.toBe(initialEnd);
    expect(actualCursorMs).toBeGreaterThan(shiftedStart);
    expect(actualCursorMs).toBeLessThan(shiftedEnd);

    const cursorLine = plot.querySelector<SVGLineElement>(".sound-cursor-line");
    expect(cursorLine).not.toBeNull();
    expect(Number(cursorLine?.getAttribute("x1"))).toBeCloseTo(50, 0);
  });
});
