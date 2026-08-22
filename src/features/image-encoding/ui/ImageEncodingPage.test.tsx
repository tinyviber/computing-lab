import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { samplingGeometry } from "../domain/model";
import { phaseControlDescription } from "./ImageEncodingPage";
import { navigateApp, renderAppAt } from "../../../test/router-test-helpers";

const slider = (name: RegExp) => screen.getByRole("slider", { name });

function sectionByHeading(name: RegExp, level: 2 | 3): HTMLElement {
  const section = screen.getByRole("heading", { level, name }).closest("section, header");
  if (!(section instanceof HTMLElement)) throw new Error(`Section not found: ${name}`);
  return section;
}

function metric(name: string): HTMLElement {
  const element = document.querySelector(`[data-metric="${name}"]`);
  if (!(element instanceof HTMLElement)) throw new Error(`Metric not found: ${name}`);
  return element;
}

function budget(): HTMLElement {
  const element = document.querySelector('[data-budget="baseline-25-percent"]');
  if (!(element instanceof HTMLElement)) throw new Error("Budget indicator not found");
  return element;
}

function feedback(kind: "judgment" | "observation"): HTMLElement {
  const element = document.querySelector(`[data-feedback="${kind}"]`);
  if (!(element instanceof HTMLElement)) throw new Error(`Feedback not found: ${kind}`);
  return element;
}

function changeSampling(value = "45") {
  const sampling = slider(/空间采样/);
  sampling.focus();
  fireEvent.change(sampling, { target: { value } });
  return sampling;
}

describe("ImageEncodingPage", () => {
  it("renders one unified mission with natural budget and meaning copy", async () => {
    await renderAppAt("/labs/image-encoding");

    expect(screen.getByRole("main", { name: /图像编码实验区/ })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /从图像到有限的像素编码/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("小猫插图")).toHaveLength(2);
    expect(screen.getByText("这次要做什么")).toBeInTheDocument();
    expect(budget()).toHaveAttribute("data-budget", "baseline-25-percent");
    expect(budget()).not.toHaveTextContent(/理论原始|平均 RGB|采样率/);
    expect(budget()).toHaveTextContent(/原来的四分之一以内/);
    expect(budget()).toHaveTextContent(/平均颜色变化（不是清晰度评分）/);
    expect(budget()).toHaveTextContent(/空间不够/);
    expect(budget()).toHaveAttribute("data-budget-state", "over");
    expect(metric("budget-raw-bits")).toHaveTextContent(/位/);
    expect(metric("current-raw-bits")).toHaveTextContent(/位/);
    expect(metric("raw-bits-delta")).toHaveTextContent(/位/);
    expect(metric("budget-raw-bytes")).toHaveTextContent(/字节/);
    expect(metric("current-raw-bytes")).toHaveTextContent(/字节/);
    expect(metric("raw-bytes-delta")).toHaveTextContent(/字节/);
    expect(metric("current-sampled-pixels")).toHaveTextContent(/个/);
    expect(metric("changed-pixels")).toHaveTextContent(/个/);
    const formatBoundary = sectionByHeading(/联系实际文件格式/, 3);
    expect(formatBoundary).toHaveTextContent(/PNG.*JPEG.*WebP/);
    expect(formatBoundary).toHaveTextContent(/实际文件大小/);
    expect(document.querySelectorAll(".lesson-flow-item")).toHaveLength(0);
    expect(document.querySelectorAll('[data-metric="budget-raw-bits"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-metric="current-raw-bits"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-metric="raw-bits-delta"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-metric="average-error"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-metric="changed-pixels"]')).toHaveLength(1);
    expect(document.querySelector('[data-budget-state="over"]')).toBeInTheDocument();
  });

  it("keeps controls independently usable and shows neutral observation guidance", async () => {
    await renderAppAt("/labs/image-encoding");

    expect(slider(/空间采样/)).toBeEnabled();
    expect(slider(/采样网格相位/)).toBeEnabled();
    expect(slider(/颜色位深/)).toBeDisabled();
    expect(screen.getByRole("button", { name: "调色板", exact: true })).toBeEnabled();
    expect(screen.getByRole("button", { name: "原色（RGB 24 位）" })).toBeEnabled();
    expect(screen.getAllByRole("tab").every((tab) => !tab.hasAttribute("disabled"))).toBe(true);
    for (const input of within(sectionByHeading(/数据量计算/, 3)).getAllByRole("spinbutton")) {
      expect(input).toBeEnabled();
    }
    expect(feedback("observation")).toHaveTextContent(/占用空间|颜色变化/);
  });

  it("updates current metrics and meaning feedback when sampling changes", async () => {
    await renderAppAt("/labs/image-encoding");

    const initialCurrentBits = metric("current-raw-bits").textContent;
    const initialDelta = metric("raw-bits-delta").textContent;
    const initialError = metric("average-error").textContent;
    changeSampling();

    expect(metric("current-raw-bits").textContent).not.toBe(initialCurrentBits);
    expect(metric("raw-bits-delta").textContent).not.toBe(initialDelta);
    expect(metric("average-error").textContent).not.toBe(initialError);
    expect(metric("current-sampled-pixels")).toHaveTextContent(/108 × 72|7,776|7776/);
    expect(feedback("judgment")).toHaveTextContent(/占用的?空间|颜色变化/);

    changeSampling("25");
    expect(budget()).toHaveAttribute("data-budget-state", "within");
    expect(budget()).toHaveTextContent(/空间够用/);
  });

  it("updates color metrics without requiring a sampling step", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding");

    await user.click(screen.getByRole("button", { name: "调色板", exact: true }));
    expect(slider(/颜色位深/)).toBeEnabled();
    const initialCurrentBits = metric("current-raw-bits").textContent;
    fireEvent.change(slider(/颜色位深/), { target: { value: "2" } });

    expect(metric("current-raw-bits").textContent).not.toBe(initialCurrentBits);
    expect(metric("average-error")).toHaveTextContent(/\d/);
    expect(feedback("judgment")).toHaveTextContent(/占用的?空间|颜色变化/);
  });

  it("keeps formula and format-boundary explanation visible without claiming file size", async () => {
    await renderAppAt("/labs/image-encoding");

    const calculator = sectionByHeading(/数据量计算/, 3);
    const width = within(calculator).getByRole("spinbutton", { name: "宽度（像素）" });
    fireEvent.change(width, { target: { value: "3" } });
    expect(calculator).toHaveTextContent(/宽度.*高度.*每像素位数/);
    expect(calculator).toHaveTextContent(/字节/);
    const formatBoundary = sectionByHeading(/联系实际文件格式/, 3);
    expect(formatBoundary).toHaveTextContent(/PNG.*JPEG.*WebP/);
    expect(formatBoundary).toHaveTextContent(/实际文件大小/);
    expect(screen.queryByText(/教学估算/)).not.toBeInTheDocument();
  });

  it("keeps URL fixtures, phase normalization, tabs, and same-size canvases", async () => {
    const { router } = await renderAppAt(
      "/labs/image-encoding?image=checkerboard&sample=99&phase=0.8",
    );
    expect(slider(/采样网格相位/)).toHaveValue("0");
    expect(slider(/采样网格相位/)).toBeDisabled();

    const narrowGeometry = samplingGeometry(
      {
        id: "narrow-ui-source",
        label: "Narrow UI source",
        sourceKind: "upload",
        width: 3,
        height: 20,
        pixels: Array.from({ length: 60 }, () => ({ r: 0, g: 0, b: 0 })),
      },
      { samplingPercent: 90, phase: 0.8 },
    );
    expect(narrowGeometry).toMatchObject({
      x: { sourceSize: 3, sampledSize: 3, effectivePhase: 0 },
      y: { sourceSize: 20, sampledSize: 18, effectivePhase: 0.8 },
    });
    expect(phaseControlDescription(narrowGeometry)).toContain("相位固定为 0");

    for (const [fixture, label] of [
      ["gradient", "平滑色彩渐变"],
      ["checkerboard", "细棋盘格"],
    ] as const) {
      await navigateApp(
        router,
        `/labs/image-encoding?image=${fixture}&sample=25&bits=2&view=representation`,
      );
      expect(screen.getAllByText(label)).toHaveLength(2);
      expect(screen.getByRole("grid", { name: /12 × 8 编码采样网格/ })).toBeInTheDocument();
      expect(screen.getByRole("img", { name: /原始源图像/ })).toHaveAttribute("width", "48");
      expect(screen.getByRole("img", { name: /重建图像/ })).toHaveAttribute("width", "48");
    }
  });

  it("keeps source and reconstruction at the same display size and exposes pixel details", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding?image=photo&sample=25&bits=4");
    expect(screen.getByRole("img", { name: /原始源图像/ })).toHaveAttribute("width", "240");
    expect(screen.getByRole("img", { name: /原始源图像/ })).toHaveAttribute("height", "160");
    expect(screen.getByRole("img", { name: /重建图像/ })).toHaveAttribute("width", "240");
    expect(screen.getByRole("img", { name: /重建图像/ })).toHaveAttribute("height", "160");

    await user.click(screen.getByRole("tab", { name: /编码表示/ }));
    fireEvent.click(screen.getByRole("img", { name: /原始源图像/ }));
    expect(screen.getByText("编码值").parentElement).toHaveTextContent(/24 bits|bits/);
    expect(screen.getByRole("heading", { name: /RGB 颜色/ })).toBeInTheDocument();
  });

  it("preserves current experiment on failed upload and resets after a successful upload", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding");
    changeSampling();

    const upload = screen.getByLabelText(/上传图片（可选）/);
    vi.stubGlobal("Image", undefined);
    try {
      fireEvent.change(upload, {
        target: { files: [new File(["not an image"], "not-an-image.png", { type: "image/png" })] },
      });
      await screen.findByRole("alert");
    } finally {
      vi.unstubAllGlobals();
    }
    expect(slider(/空间采样/)).toHaveValue("45");

    const context = {
      createImageData: vi.fn((width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
      })),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4 * 2 * 4) })),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    const createObjectURL = vi.fn(() => "blob:test-upload");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
      writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
      writable: true,
    });
    class MockImage {
      naturalWidth = 4;
      naturalHeight = 2;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;

      set src(_value: string) {
        this.onload?.();
      }
    }
    vi.stubGlobal("Image", MockImage);

    try {
      fireEvent.change(upload, {
        target: { files: [new File(["fake image"], "uploaded.png", { type: "image/png" })] },
      });
      await screen.findByText(/已载入 uploaded\.png/);
    } finally {
      vi.unstubAllGlobals();
      getContext.mockRestore();
      delete (URL as typeof URL & { createObjectURL?: unknown }).createObjectURL;
      delete (URL as typeof URL & { revokeObjectURL?: unknown }).revokeObjectURL;
    }

    expect(screen.getAllByText(/已上传图像/)).toHaveLength(2);
    expect(slider(/空间采样/)).toHaveValue("50");
    expect(metric("raw-bits-delta")).toHaveTextContent(/0/);

    await user.click(
      within(sectionByHeading(/本节使用的图像/, 3)).getByRole("button", {
        name: "恢复初始情境",
      }),
    );
    expect(slider(/空间采样/)).toHaveValue("50");
  });
});
