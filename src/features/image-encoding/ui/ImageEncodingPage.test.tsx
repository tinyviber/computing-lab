import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { samplingGeometry } from "../domain/model";
import { phaseControlDescription } from "./ImageEncodingPage";
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
    expect(slider(/空间采样/)).toHaveValue("25");
    expect(slider(/采样网格相位/)).toHaveValue("0.5");
    expect(slider(/颜色位深/)).toHaveValue("2");
    expect(screen.getByRole("tab", { name: /编码表示/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("12 × 8 × 2 = 192 位")).toBeInTheDocument();
  });

  it("uses rounded per-axis geometry to explain or disable phase", async () => {
    await renderAppAt("/labs/image-encoding?image=photo&sample=99&phase=0.8");
    expect(slider(/采样网格相位/)).toHaveValue("0");
    expect(slider(/采样网格相位/)).toBeDisabled();
    expect(screen.getByText(/两个方向都已达到原图采样密度/)).toBeInTheDocument();

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
    expect(phaseControlDescription(narrowGeometry)).toContain(
      "水平：完整密度（3/3）· 相位固定为 0。",
    );
    expect(phaseControlDescription(narrowGeometry)).toContain("垂直：18/20 个采样 · 相位 0.80。");
  });

  it("renders app chrome plus feature-owned source, compare, and inspector regions", async () => {
    await renderAppAt("/labs/image-encoding");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("main", { name: /图像编码 workspace/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /从真实图像到有限的像素编码/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /选择或上传源图像/ })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: /从一个显示像素追踪到 bits/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/step 1/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /提交编码/ })).not.toBeInTheDocument();
  });

  it("keeps source and reconstruction at the same physical display size", async () => {
    await renderAppAt("/labs/image-encoding?image=photo&sample=25&bits=4");
    const source = screen.getByRole("img", { name: /原始源图像/ });
    const reconstructed = screen.getByRole("img", { name: /由采样值和量化值重建的图像/ });
    expect(source).toHaveAttribute("width", "48");
    expect(source).toHaveAttribute("height", "32");
    expect(reconstructed).toHaveAttribute("width", "48");
    expect(reconstructed).toHaveAttribute("height", "32");
    expect(screen.getByText("12 × 8 × 4 = 384 位")).toBeInTheDocument();
  });

  it("updates sampling and quantization independently with live evidence", async () => {
    await renderAppAt("/labs/image-encoding");
    setSlider(slider(/空间采样/), 25);
    expect(screen.getByText("12 × 8 × 4 = 384 位")).toBeInTheDocument();
    setSlider(slider(/颜色位深/), 2);
    expect(screen.getByText("12 × 8 × 2 = 192 位")).toBeInTheDocument();
    expect(screen.getByText(/没有提交步骤/)).toBeInTheDocument();
  });

  it("turns exploration actions into six unlocked task-sheet evidence items", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding");
    setSlider(slider(/空间采样/), 25);
    await user.click(screen.getByRole("tab", { name: /采样重建/ }));
    setSlider(slider(/颜色位深/), 2);
    await user.click(screen.getByRole("tab", { name: /量化重建/ }));
    await user.click(screen.getByRole("tab", { name: /编码表示/ }));
    fireEvent.click(screen.getByRole("img", { name: /原始源图像/ }), { clientX: 1, clientY: 1 });

    expect(screen.getByLabelText(/已解锁 6 项探索证据/)).toBeInTheDocument();
    expect(screen.getByText(/点击一个像素，追踪它最终写入的索引 bits/).closest("li")).toHaveClass(
      "is-done",
    );
    expect(screen.getByText(/为什么真实 PNG\/JPEG 文件大小/).closest("li")).not.toHaveClass(
      "is-done",
    );
  });

  it("keeps the sampling view independent from bit-depth quantization", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding?image=gradient&sample=50&bits=1");
    await user.click(screen.getByRole("tab", { name: /采样重建/ }));
    const cell = within(screen.getByRole("grid")).getAllByRole("gridcell")[0];
    const sampledColor = cell.getAttribute("style");
    setSlider(slider(/颜色位深/), 8);
    expect(cell.getAttribute("style")).toBe(sampledColor);
  });

  it("shows a pixel-to-bits inspector and representation cells", async () => {
    await renderAppAt("/labs/image-encoding?image=gradient&sample=50&bits=3&view=representation");
    const grid = screen.getByRole("grid", { name: /编码采样网格/ });
    expect(within(grid).getAllByRole("gridcell")).toHaveLength(384);
    expect(screen.getByText("编码值").parentElement).toHaveTextContent(/3 bits/);
    expect(screen.getByText("有限颜色状态").closest(".image-card-heading")).toHaveTextContent(
      /有限颜色状态/,
    );
  });

  it("switches to an error map without changing the encoded model", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding?image=checkerboard&sample=25&bits=2");
    await user.click(screen.getByRole("tab", { name: /可见误差图/ }));
    expect(screen.getByRole("img", { name: /像素误差图/ })).toBeInTheDocument();
    expect(screen.getByText(/理论原始载荷/)).toBeInTheDocument();
    expect(screen.queryByText(/compression ratio/i)).not.toBeInTheDocument();
  });

  it("keeps the feature layout inside the app main and supports reset", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding?image=gradient&sample=25&bits=2");
    setSlider(slider(/空间采样/), 90);
    await user.click(screen.getByRole("button", { name: /恢复样例情境/ }));
    expect(slider(/空间采样/)).toHaveValue("25");
    expect(
      screen.getByRole("heading", { level: 3, name: /从一个显示像素追踪到 bits/ }).closest("main"),
    ).toBe(screen.getByRole("main"));
    expect(screen.getByRole("grid").closest("#lab-navigation")).toBeNull();
  });
});
