import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ImageEncodingPage } from "./ImageEncodingPage";

const getDensitySlider = () => screen.getByRole("slider", { name: /density/i });
const getBitsSlider = () => screen.getByRole("slider", { name: /bits/i });
const getStatus = () => screen.getByRole("status");
const getSubmitButton = () => screen.getByRole("button", { name: /^submit$/i });
const getPreviewButton = () =>
  screen.getByRole("button", { name: /run preview/i });
const getRetryButton = () => screen.getByRole("button", { name: /^retry$/i });
const getNextStepButton = () =>
  screen.getByRole("button", { name: /next step/i });
const getResetButton = () => screen.getByRole("button", { name: /^reset$/i });

function setSliderValue(
  slider: HTMLElement,
  value: number,
  key: "ArrowLeft" | "ArrowRight" | "Home" | "End",
) {
  slider.focus();
  fireEvent.keyDown(slider, { key, code: key });
  fireEvent.change(slider, { target: { value: String(value) } });
}

async function reachSuccess(user: ReturnType<typeof userEvent.setup>) {
  await user.click(getPreviewButton());
  await user.click(getSubmitButton());
  expect(getStatus()).toHaveTextContent(/success/i);
}

describe("ImageEncodingPage", () => {
  it("renders semantic landmarks, one h1, default controls, and a 4x4 grid", () => {
    render(<ImageEncodingPage />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/ready/i);
    expect(screen.getByText("Step 1 / 4", { exact: true })).toBeInTheDocument();
    const workflow = screen.getByRole("navigation", { name: "Workflow steps" });
    expect(within(workflow).getAllByRole("listitem")).toHaveLength(4);
    expect(within(workflow).getByText("Observe sampling", { exact: true })).toBeInTheDocument();
    expect(within(workflow).getByText("Adjust quantization", { exact: true })).toBeInTheDocument();
    expect(within(workflow).getByText("Calculate file size", { exact: true })).toBeInTheDocument();
    expect(within(workflow).getByText("Write conclusion", { exact: true })).toBeInTheDocument();
    expect(workflow.querySelector('[aria-current="step"]')).toHaveTextContent("1");
    expect(getDensitySlider()).toHaveValue("4");
    expect(getBitsSlider()).toHaveValue("8");
    for (const slider of [getDensitySlider(), getBitsSlider()]) {
      expect(slider).toHaveAttribute("type", "range");
      expect(slider).toHaveAttribute("min", "2");
      expect(slider).toHaveAttribute("max", "8");
      expect(slider).toHaveAttribute("step", "1");
    }
    expect(getDensitySlider()).toHaveAttribute("aria-valuenow", "4");
    expect(getBitsSlider()).toHaveAttribute("aria-valuenow", "8");
    expect(getDensitySlider()).toHaveAttribute("aria-valuemin", "2");
    expect(getDensitySlider()).toHaveAttribute("aria-valuemax", "8");
    expect(getBitsSlider()).toHaveAttribute("aria-valuemin", "2");
    expect(getBitsSlider()).toHaveAttribute("aria-valuemax", "8");

    const grid = screen.getByRole("grid");
    expect(within(grid).getAllByRole("gridcell")).toHaveLength(16);
    expect(screen.getByText(/sampled pixels/i)).toBeInTheDocument();
    expect(screen.getByText("Quantization", { exact: true })).toBeInTheDocument();
  });

  it("updates the displayed value and exact metrics from pointer/change interaction", async () => {
    const user = userEvent.setup();
    render(<ImageEncodingPage />);

    const densitySlider = getDensitySlider();
    await user.click(densitySlider);
    fireEvent.change(densitySlider, { target: { value: "5" } });

    expect(densitySlider).toHaveValue("5");
    expect(densitySlider).toHaveAttribute("aria-valuenow", "5");
    expect(getStatus()).toHaveTextContent(/editing/i);

    const main = screen.getByRole("main");
    expect(main).toHaveTextContent(/25/); // sampled pixels
    expect(main).toHaveTextContent(/150/); // file size
    expect(main).toHaveTextContent(/98%?/); // quality
    expect(main).toHaveTextContent(/2%?/); // error
    expect(main).toHaveTextContent(/13\.7/); // ratio
  });

  it("exposes source, snapped display, row, column, sample, and bits in pixel labels", async () => {
    const user = userEvent.setup();
    render(<ImageEncodingPage />);

    const firstCell = within(screen.getByRole("grid")).getAllByRole("gridcell")[0];
    expect(firstCell).toHaveAccessibleName(
      /row 1.*column 1.*sample 1.*source #2E6F95.*display #2E6F95.*bits 8/i,
    );

    setSliderValue(getBitsSlider(), 6, "ArrowLeft");
    expect(getBitsSlider()).toHaveValue("6");
    expect(firstCell).toHaveAccessibleName(
      /row 1.*column 1.*sample 1.*source #2E6F95.*display #2D6D96.*bits 6/i,
    );

    setSliderValue(getBitsSlider(), 2, "Home");
    expect(getBitsSlider()).toHaveValue("2");
    expect(firstCell).toHaveAccessibleName(
      /row 1.*column 1.*sample 1.*source #2E6F95.*display #5555AA.*bits 2/i,
    );
  });

  it("enters editing on slider changes, clamps native slider bounds, and updates exact summary values", async () => {
    const user = userEvent.setup();
    render(<ImageEncodingPage />);

    setSliderValue(getDensitySlider(), 2, "Home");
    expect(getDensitySlider()).toHaveValue("2");
    expect(getDensitySlider()).toHaveAttribute("aria-valuenow", "2");
    expect(getStatus()).toHaveTextContent(/editing/i);
    expect(screen.getByText("Sampled pixels").parentElement).toHaveTextContent("4 px");
    expect(screen.getByText("File estimate").parentElement).toHaveTextContent("24 KB");
    expect(screen.getByText("Compression ratio").parentElement).toHaveTextContent("85.3×");
    expect(screen.getByText("Quality").parentElement).toHaveTextContent("80%");
    expect(screen.getByText("Color error").parentElement).toHaveTextContent("20%");

    setSliderValue(getDensitySlider(), 2, "ArrowLeft");
    expect(getDensitySlider()).toHaveValue("2");
    setSliderValue(getBitsSlider(), 8, "End");
    expect(getBitsSlider()).toHaveValue("8");
  });

  it("only submits from editing and fails when the target is not density 4 / 8 bits", async () => {
    const user = userEvent.setup();
    render(<ImageEncodingPage />);

    await user.click(getSubmitButton());
    expect(getStatus()).toHaveTextContent(/ready/i);

    setSliderValue(getDensitySlider(), 2, "Home");
    await user.click(getSubmitButton());
    expect(getStatus()).toHaveTextContent(/failure/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/failure/i);
    await user.click(getPreviewButton());
    expect(getStatus()).toHaveTextContent(/failure/i);
  });

  it("runs preview only from ready, retries only failures, and retains values", async () => {
    const user = userEvent.setup();
    render(<ImageEncodingPage />);

    await user.click(getPreviewButton());
    expect(getStatus()).toHaveTextContent(/editing/i);
    await user.click(getPreviewButton());
    expect(getStatus()).toHaveTextContent(/editing/i);

    setSliderValue(getDensitySlider(), 2, "Home");
    await user.click(getSubmitButton());
    expect(getStatus()).toHaveTextContent(/failure/i);

    await user.click(getRetryButton());
    expect(getStatus()).toHaveTextContent(/editing/i);
    expect(getDensitySlider()).toHaveValue("2");
    expect(getBitsSlider()).toHaveValue("8");

    await user.click(getRetryButton());
    expect(getStatus()).toHaveTextContent(/editing/i);
  });

  it("succeeds at density 4 / 8 bits and advances through steps only after success", async () => {
    const user = userEvent.setup();
    render(<ImageEncodingPage />);

    setSliderValue(getDensitySlider(), 5, "ArrowRight");
    setSliderValue(getDensitySlider(), 4, "ArrowLeft");
    expect(getStatus()).toHaveTextContent(/editing/i);
    await user.click(getSubmitButton());
    expect(getStatus()).toHaveTextContent(/success/i);
    await user.click(getPreviewButton());
    expect(getStatus()).toHaveTextContent(/success/i);

    await user.click(getNextStepButton());
    expect(getStatus()).toHaveTextContent(/ready/i);
    expect(getDensitySlider()).toHaveValue("4");
    expect(getBitsSlider()).toHaveValue("8");

    await reachSuccess(user);
    await user.click(getNextStepButton());
    expect(getStatus()).toHaveTextContent(/ready/i);

    await reachSuccess(user);
    await user.click(getNextStepButton());
    expect(getStatus()).toHaveTextContent(/ready/i);

    await reachSuccess(user);
    expect(getNextStepButton()).toBeDisabled();
    await user.click(getNextStepButton());
    expect(getStatus()).toHaveTextContent(/success/i);
  });

  it("resets every phase to ready/default values while retaining the current step", async () => {
    const user = userEvent.setup();
    render(<ImageEncodingPage />);

    await reachSuccess(user);
    await user.click(getNextStepButton());
    await reachSuccess(user);
    await user.click(getNextStepButton());
    await reachSuccess(user);
    await user.click(getNextStepButton());
    await reachSuccess(user);
    expect(getStatus()).toHaveTextContent(/success/i);

    setSliderValue(getDensitySlider(), 2, "Home");
    expect(getStatus()).toHaveTextContent(/editing/i);
    await user.click(getResetButton());

    expect(getStatus()).toHaveTextContent(/ready/i);
    expect(getDensitySlider()).toHaveValue("4");
    expect(getBitsSlider()).toHaveValue("8");
    expect(getNextStepButton()).toBeDisabled();
  });

  it("keeps controls available in every phase except the disabled step-4 advance", async () => {
    const user = userEvent.setup();
    render(<ImageEncodingPage />);

    for (const control of [
      getDensitySlider(),
      getBitsSlider(),
      getPreviewButton(),
      getSubmitButton(),
      getRetryButton(),
      getNextStepButton(),
      getResetButton(),
    ]) {
      expect(control).not.toBeDisabled();
    }

    await user.click(getNextStepButton());
    expect(getStatus()).toHaveTextContent(/ready/i);

    await reachSuccess(user);
    expect(getDensitySlider()).not.toBeDisabled();
    expect(getBitsSlider()).not.toBeDisabled();
    expect(getResetButton()).not.toBeDisabled();
  });
});
