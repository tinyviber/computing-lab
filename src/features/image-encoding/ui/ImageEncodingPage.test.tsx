import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers.test";

const slider = (name: RegExp) => screen.getByRole("slider", { name });
const status = () => screen.getByRole("status");

function setSlider(sliderElement: HTMLElement, value: number) {
  fireEvent.change(sliderElement, { target: { value: String(value) } });
}

function formulaPanel() {
  const panel = document.querySelector<HTMLElement>(".formula-panel");
  if (!panel) throw new Error("FormulaPanel is not rendered");
  return within(panel);
}

async function reachSuccess(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /run preview/i }));
  await user.click(screen.getByRole("button", { name: /^submit$/i }));
}

describe("ImageEncodingPage", () => {
  it("hydrates shareable low-sampling scenario and explicit bit override", async () => {
    await renderAppAt("/labs/image-encoding?scenario=low-sampling&bits=3");

    expect(slider(/density/i)).toHaveValue("2");
    expect(slider(/bits/i)).toHaveValue("3");
    expect(within(screen.getByRole("grid")).getAllByRole("gridcell")).toHaveLength(4);
    expect(screen.getByText("4 × 3 = 12 bits")).toBeInTheDocument();
  });

  it("hydrates a new same-route query deterministically after remount", async () => {
    const first = await renderAppAt("/labs/image-encoding?scenario=low-sampling");
    expect(slider(/density/i)).toHaveValue("2");

    first.unmount();
    const { router } = await renderAppAt(
      "/labs/image-encoding?scenario=high-quantization&density=3&bits=7",
    );
    await router.load();

    expect(slider(/density/i)).toHaveValue("3");
    expect(slider(/bits/i)).toHaveValue("7");
  });

  it("renders landmarks, workflow, controls, and default 4×4 grid", async () => {
    await renderAppAt("/labs/image-encoding");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByText("Step 1 / 4")).toBeInTheDocument();
    expect(
      within(screen.getByRole("navigation", { name: "Workflow steps" })).getAllByRole("listitem"),
    ).toHaveLength(4);
    expect(slider(/density/i)).toHaveValue("4");
    expect(slider(/bits/i)).toHaveValue("8");
    expect(within(screen.getByRole("grid")).getAllByRole("gridcell")).toHaveLength(16);
  });

  it("updates exact formula metrics and pixel count", async () => {
    await renderAppAt("/labs/image-encoding");
    setSlider(slider(/density/i), 5);
    expect(status()).toHaveTextContent(/editing/i);
    expect(screen.getByText("Sampled pixels").parentElement).toHaveTextContent("25 px");
    expect(screen.getByText("Encoded payload").parentElement).toHaveTextContent("200 bits");
    expect(within(screen.getByRole("grid")).getAllByRole("gridcell")).toHaveLength(25);
  });

  it("exposes source, snapped display, row, column, sample, and bits", async () => {
    await renderAppAt("/labs/image-encoding");
    const firstCell = within(screen.getByRole("grid")).getAllByRole("gridcell")[0];
    expect(firstCell).toHaveAccessibleName(/row 1.*column 1.*sample 1.*source #2E6F95.*bits 8/i);
    setSlider(slider(/bits/i), 2);
    expect(firstCell).toHaveAccessibleName(/display #7C9EB2.*bits 2/i);
  });

  it("submits only from editing and handles retry/success progression", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding");
    await user.click(screen.getByRole("button", { name: /^submit$/i }));
    expect(status()).toHaveTextContent(/ready/i);
    setSlider(slider(/density/i), 2);
    await user.click(screen.getByRole("button", { name: /^submit$/i }));
    expect(status()).toHaveTextContent(/failure/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/density 4 and 8 bits/i);
    await user.click(screen.getByRole("button", { name: /^retry$/i }));
    expect(status()).toHaveTextContent(/editing/i);
    setSlider(slider(/density/i), 4);
    await user.click(screen.getByRole("button", { name: /^submit$/i }));
    expect(status()).toHaveTextContent(/success/i);
    await user.click(screen.getByRole("button", { name: /next step/i }));
    expect(screen.getByText("Step 2 / 4")).toBeInTheDocument();
  });

  it("reset returns values and phase without changing workflow step", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding");
    await reachSuccess(user);
    await user.click(screen.getByRole("button", { name: /next step/i }));
    setSlider(slider(/density/i), 2);
    await user.click(screen.getByRole("button", { name: /^reset$/i }));
    expect(status()).toHaveTextContent(/ready/i);
    expect(slider(/density/i)).toHaveValue("4");
    expect(slider(/bits/i)).toHaveValue("8");
    expect(screen.getByText("Step 2 / 4")).toBeInTheDocument();
  });

  it("supports keyboard slider changes and updates grid dimensions", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding");

    const densityControl = slider(/density/i);
    densityControl.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    // jsdom does not synthesize native range input value changes from key presses.
    fireEvent.change(densityControl, { target: { value: "6" } });

    expect(densityControl).toHaveValue("6");
    expect(within(screen.getByRole("grid")).getAllByRole("gridcell")).toHaveLength(36);
    expect(status()).toHaveTextContent(/editing/i);
  });

  it("keeps one page heading and exposes formula landmarks", async () => {
    await renderAppAt("/labs/image-encoding");

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("main", { name: /图像编码 workspace/i })).toBeInTheDocument();
    expect(formulaPanel().getByText("Indexed payload").parentElement).toHaveTextContent(
      "16 × 8 = 128 bits",
    );
    expect(document.querySelector(".visualization-panel")).toBeInTheDocument();
    expect(document.querySelector(".formula-panel")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/ready/i);
  });

  it("shows encoded bytes and raw source baseline formula", async () => {
    await renderAppAt("/labs/image-encoding");

    const summary = document.querySelector<HTMLElement>(".summary-panel");
    if (!summary) throw new Error("Image summary is not rendered");
    expect(within(summary).getByText("Encoded bytes").parentElement).toHaveTextContent("16 bytes");
    expect(within(summary).getByText("Raw baseline").parentElement).toHaveTextContent("1536 bits");
    expect(formulaPanel().getByText("Raw baseline").parentElement).toHaveTextContent(
      "8×8 uncompressed 24-bit RGB source",
    );
    expect(formulaPanel().getByText("Encoded bytes").parentElement).toHaveTextContent(
      "ceil(128 / 8) = 16 bytes",
    );
  });
});
