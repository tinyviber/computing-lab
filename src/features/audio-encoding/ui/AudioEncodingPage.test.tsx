import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AudioEncodingPage } from "./AudioEncodingPage";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
}));

function formulaPanel() {
  const panel = document.querySelector<HTMLElement>(".formula-panel");
  if (!panel) throw new Error("FormulaPanel is not rendered");
  return within(panel);
}

describe("AudioEncodingPage", () => {
  it("renders waveform, formula, controls, and local status", () => {
    window.history.replaceState({}, "", "/labs/audio-encoding");
    render(<AudioEncodingPage />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("main", { name: /声音编码 workspace/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /16 sampled waveform points/i })).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /16 reconstructed waveform samples/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /sampling rate/i })).toHaveValue("16");
    expect(screen.getByRole("slider", { name: /quantization bits/i })).toHaveValue("8");
    expect(formulaPanel().getByText("Packed payload")).toBeInTheDocument();
    expect(formulaPanel().getByText("16 × 8 bits")).toBeInTheDocument();
    expect(formulaPanel().getByText("16 bytes")).toBeInTheDocument();
    expect(document.querySelector(".visualization-panel")).toBeInTheDocument();
    expect(document.querySelector(".formula-panel")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/ready/i);
  });

  it("exposes a labelled SVG waveform with varying y values", () => {
    window.history.replaceState({}, "", "/labs/audio-encoding");
    render(<AudioEncodingPage />);

    const waveform = screen.getByRole("group", { name: /16 sampled waveform points/i });
    const waveformImage = within(waveform).getByRole("img", {
      name: /16 reconstructed waveform samples/i,
    });
    const line = waveformImage.querySelector(".waveform-line");
    if (!line) throw new Error("Waveform polyline is not rendered");
    const points = line.getAttribute("points");
    if (!points) throw new Error("Waveform polyline points are not rendered");
    const yValues = points
      .split(" ")
      .map((point) => Number(point.split(",")[1]))
      .filter((value) => Number.isFinite(value));

    expect(waveform).toHaveAccessibleName("16 sampled waveform points");
    expect(yValues).toHaveLength(16);
    expect(new Set(yValues).size).toBeGreaterThan(1);
  });

  it("updates waveform point count, formula, and editing status", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/labs/audio-encoding");
    render(<AudioEncodingPage />);

    const rate = screen.getByRole("slider", { name: /sampling rate/i });
    rate.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    fireEvent.change(rate, { target: { value: "18" } });

    expect(rate).toHaveValue("18");
    expect(screen.getByRole("group", { name: /18 sampled waveform points/i })).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /18 reconstructed waveform samples/i }),
    ).toBeInTheDocument();
    expect(formulaPanel().getByText("18 × 8 bits")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/listening/i);
  });

  it("clamps range input events and exposes encoded byte metric", () => {
    window.history.replaceState({}, "", "/labs/audio-encoding");
    render(<AudioEncodingPage />);

    fireEvent.change(screen.getByRole("slider", { name: /quantization bits/i }), {
      target: { value: "2" },
    });

    expect(screen.getByRole("slider", { name: /quantization bits/i })).toHaveValue("2");
    const summary = document.querySelector<HTMLElement>(".audio-summary");
    if (!summary) throw new Error("Audio summary is not rendered");
    expect(within(summary).getByText("Encoded bytes").parentElement).toHaveTextContent("4");
  });

  it("hydrates low-frequency scenario from URL when supported by lesson parser", () => {
    window.history.replaceState({}, "", "/labs/audio-encoding?scenario=low-frequency");
    render(<AudioEncodingPage />);

    expect(screen.getByRole("slider", { name: /sampling rate/i })).toHaveValue("8");
    expect(screen.getByRole("slider", { name: /quantization bits/i })).toHaveValue("8");
  });
});
