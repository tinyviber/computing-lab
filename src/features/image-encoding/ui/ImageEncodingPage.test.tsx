import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";

const slider = (name: RegExp) => screen.getByRole("slider", { name });

function setSlider(element: HTMLElement, value: number) {
  fireEvent.change(element, { target: { value: String(value) } });
}

describe("ImageEncodingPage", () => {
  it("hydrates the canonical scenario URL and exposes encoded dimensions", async () => {
    await renderAppAt(
      "/labs/image-encoding?image=checkerboard&sample=25&phase=0.5&bits=2&view=representation",
    );
    expect(slider(/spatial sampling/i)).toHaveValue("25");
    expect(slider(/grid phase/i)).toHaveValue("0.5");
    expect(slider(/color bit depth/i)).toHaveValue("2");
    expect(screen.getByRole("tab", { name: /encoded representation/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("12 × 8 × 2 = 192 bits")).toBeInTheDocument();
  });

  it("renders app chrome plus feature-owned source, compare, and inspector regions", async () => {
    await renderAppAt("/labs/image-encoding");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("main", { name: /图像编码 workspace/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /从真实图像到有限的像素编码/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: /choose or upload/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: /one displayed pixel/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/step 1/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /submit encoding/i })).not.toBeInTheDocument();
  });

  it("keeps source and reconstruction at the same physical display size", async () => {
    await renderAppAt("/labs/image-encoding?image=photo&sample=25&bits=4");
    const source = screen.getByRole("img", { name: /original source image/i });
    const reconstructed = screen.getByRole("img", { name: /reconstructed image/i });
    expect(source).toHaveAttribute("width", "48");
    expect(source).toHaveAttribute("height", "32");
    expect(reconstructed).toHaveAttribute("width", "48");
    expect(reconstructed).toHaveAttribute("height", "32");
    expect(screen.getByText("12 × 8 × 4 = 384 bits")).toBeInTheDocument();
  });

  it("updates sampling and quantization independently with live evidence", async () => {
    await renderAppAt("/labs/image-encoding");
    setSlider(slider(/spatial sampling/i), 25);
    expect(screen.getByText("12 × 8 × 4 = 384 bits")).toBeInTheDocument();
    setSlider(slider(/color bit depth/i), 2);
    expect(screen.getByText("12 × 8 × 2 = 192 bits")).toBeInTheDocument();
    expect(screen.getByText(/There is no submit step/i)).toBeInTheDocument();
  });

  it("keeps the sampling view independent from bit-depth quantization", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding?image=gradient&sample=50&bits=1");
    await user.click(screen.getByRole("tab", { name: /sampling reconstruction/i }));
    const cell = within(screen.getByRole("grid")).getAllByRole("gridcell")[0];
    const sampledColor = cell.getAttribute("style");
    setSlider(slider(/color bit depth/i), 8);
    expect(cell.getAttribute("style")).toBe(sampledColor);
  });

  it("shows a pixel-to-bits inspector and representation cells", async () => {
    await renderAppAt("/labs/image-encoding?image=gradient&sample=50&bits=3&view=representation");
    const grid = screen.getByRole("grid", { name: /encoded sample grid/i });
    expect(within(grid).getAllByRole("gridcell")).toHaveLength(384);
    expect(screen.getByText("Encoded value").parentElement).toHaveTextContent(/3 bits/);
    expect(
      screen.getByText("Finite color states").closest(".image-card-heading"),
    ).toHaveTextContent(/available/);
  });

  it("switches to an error map without changing the encoded model", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding?image=checkerboard&sample=25&bits=2");
    await user.click(screen.getByRole("tab", { name: /visible error map/i }));
    expect(screen.getByRole("img", { name: /pixel error map/i })).toBeInTheDocument();
    expect(screen.getByText(/theoretical raw pixel payload/i)).toBeInTheDocument();
    expect(screen.queryByText(/compression ratio/i)).not.toBeInTheDocument();
  });

  it("keeps the feature layout inside the app main and supports reset", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding?image=gradient&sample=25&bits=2");
    setSlider(slider(/spatial sampling/i), 90);
    await user.click(screen.getByRole("button", { name: /reset scenario/i }));
    expect(slider(/spatial sampling/i)).toHaveValue("25");
    expect(
      screen.getByRole("heading", { level: 3, name: /one displayed pixel/i }).closest("main"),
    ).toBe(screen.getByRole("main"));
    expect(screen.getByRole("grid").closest("#lab-navigation")).toBeNull();
  });
});
