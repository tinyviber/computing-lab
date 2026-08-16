import { fireEvent, screen } from "@testing-library/react";
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

    const live = screen.getByRole("status");
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
});
