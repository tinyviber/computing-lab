import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { samplingGeometry } from "../domain/model";
import { phaseControlDescription } from "./ImageEncodingPage";
import { navigateApp, renderAppAt } from "../../../test/router-test-helpers";

const slider = (name: RegExp) => screen.getByRole("slider", { name });

function setSlider(element: HTMLElement, value: number) {
  fireEvent.change(element, { target: { value: String(value) } });
}

type MissionExpectation = {
  done: boolean;
  evidence: boolean;
};

const evidenceStatus = /(?:相关)?证据(?:已解锁|已出现|可用)/;

function missionItem(title: RegExp): HTMLElement {
  const list = document.querySelector<HTMLOListElement>(".mission-list");
  if (!list) throw new Error("Mission list not found");
  const item = within(list).getByText(title).closest("li");
  if (!(item instanceof HTMLElement)) throw new Error(`Mission item not found: ${title}`);
  return item;
}

function expectMission(title: RegExp, expected: MissionExpectation) {
  const item = missionItem(title);
  if (expected.done) {
    expect(item).toHaveClass("is-done");
  } else {
    expect(item).not.toHaveClass("is-done");
  }
  if (expected.evidence) {
    expect(item).toHaveTextContent(evidenceStatus);
  } else {
    expect(item).not.toHaveTextContent(evidenceStatus);
  }
}

function expectExplorationCount(count: number) {
  const progress = screen.getByLabelText(/探索证据/);
  expect(progress).toHaveTextContent(new RegExp(`${count}\\s*/\\s*6`));
}

async function unlockSixExplorationEvidence() {
  const user = userEvent.setup();
  setSlider(slider(/空间采样/), 49);
  await user.click(screen.getByRole("tab", { name: /采样重建/ }));
  setSlider(slider(/颜色位深/), 3);
  setSlider(slider(/颜色位深/), 2);
  await user.click(screen.getByRole("tab", { name: /量化重建/ }));
  await user.click(screen.getByRole("tab", { name: /编码表示/ }));
  fireEvent.click(screen.getByRole("img", { name: /原始源图像/ }));
}

function sectionByHeading(name: RegExp, level: 2 | 3): HTMLElement {
  const section = screen.getByRole("heading", { level, name }).closest("section, header");
  if (!(section instanceof HTMLElement)) throw new Error(`Section not found: ${name}`);
  return section;
}

describe("ImageEncodingPage", () => {
  it("makes the first parameter actions explicit", async () => {
    await renderAppAt("/labs/image-encoding");

    expect(missionItem(/把空间采样调到/)).toHaveTextContent(/拖动.*滑杆.*例如 25%/);
    expect(missionItem(/把颜色位深调到/)).toHaveTextContent(/拖动.*滑杆到 2 位/);
    expect(screen.getAllByText(/拖动滑杆（也可聚焦后用方向键）/)).toHaveLength(2);
  });

  it("hydrates the canonical scenario URL and exposes encoded dimensions", async () => {
    await renderAppAt(
      "/labs/image-encoding?image=checkerboard&sample=25&phase=0.5&bits=2&view=representation",
    );
    expect(slider(/空间采样/)).toHaveValue("25");
    expect(slider(/采样网格相位/)).toHaveValue("0.5");
    expect(slider(/颜色位深/)).toHaveValue("2");
    expect(screen.getByRole("tab", { name: /编码表示/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("grid", { name: /12 × 8 编码采样网格/ })).toBeInTheDocument();
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

  it("renders image course outline as a neutral feature-local map", async () => {
    await renderAppAt("/labs/image-encoding");

    const outline = screen.getByRole("navigation", { name: "图像编码学习流程" });
    expect(outline).toHaveTextContent(/任务单/);
    expect(outline).toHaveTextContent(/观察重建/);
    expect(outline).toHaveTextContent(/追踪 bits/);
    expect(outline).toHaveTextContent(/迁移解释/);
    expect(outline.querySelector(".is-current")).toBeNull();
    expect(outline).not.toHaveTextContent(/进行中/);
  });

  it("keeps source and reconstruction at the same physical display size", async () => {
    await renderAppAt("/labs/image-encoding?image=photo&sample=25&bits=4");
    const source = screen.getByRole("img", { name: /原始源图像/ });
    const reconstructed = screen.getByRole("img", { name: /重建图像/ });
    expect(source).toHaveAttribute("width", "48");
    expect(source).toHaveAttribute("height", "32");
    expect(reconstructed).toHaveAttribute("width", "48");
    expect(reconstructed).toHaveAttribute("height", "32");
  });

  it("updates sampling and quantization independently with live evidence", async () => {
    await renderAppAt("/labs/image-encoding");
    setSlider(slider(/空间采样/), 25);
    expect(slider(/空间采样/)).toHaveValue("25");
    setSlider(slider(/颜色位深/), 2);
    expect(slider(/颜色位深/)).toHaveValue("2");
    expect(screen.getByText(/没有提交步骤/)).toBeInTheDocument();
  });

  it("separates operation completion from evidence for cognitive tasks", async () => {
    await renderAppAt("/labs/image-encoding");
    expectExplorationCount(0);
    expectMission(/先预测/, { done: false, evidence: false });
    expectMission(/把空间采样调到/, { done: false, evidence: false });
    expectMission(/采样重建.*记录一种变化/, { done: false, evidence: false });
    expectMission(/把颜色位深调到/, { done: false, evidence: false });
    expectMission(/切换到“量化重建”，记录一种变化/, { done: false, evidence: false });
    expectMission(/打开编码表示并点击一个像素/, { done: false, evidence: false });
    expectMission(/用公式核对/, { done: false, evidence: false });
    expectMission(/讨论：同样的载荷/, { done: false, evidence: false });
    expectMission(/迁移：为什么真实/, { done: false, evidence: false });
    expectMission(/最后用 80 字/, { done: false, evidence: false });

    setSlider(slider(/空间采样/), 49);
    expectMission(/把空间采样调到/, { done: true, evidence: true });
    expectMission(/采样重建.*记录一种变化/, { done: false, evidence: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: /采样重建/ }));
    expectMission(/采样重建.*记录一种变化/, { done: false, evidence: true });

    setSlider(slider(/颜色位深/), 2);
    expectMission(/把颜色位深调到/, { done: true, evidence: true });
    expectMission(/切换到“量化重建”，记录一种变化/, { done: false, evidence: false });

    await user.click(screen.getByRole("tab", { name: /量化重建/ }));
    expectMission(/切换到“量化重建”，记录一种变化/, { done: false, evidence: true });

    await user.click(screen.getByRole("tab", { name: /编码表示/ }));
    expectMission(/用公式核对/, { done: false, evidence: true });
    expectMission(/打开编码表示并点击一个像素/, { done: false, evidence: false });
    expect(missionItem(/用公式核对/)).not.toHaveTextContent(/已完成/);

    fireEvent.click(screen.getByRole("img", { name: /原始源图像/ }));
    expectMission(/打开编码表示并点击一个像素/, { done: true, evidence: true });
    expectMission(/用公式核对/, { done: false, evidence: true });
    expectMission(/讨论：同样的载荷/, { done: false, evidence: false });
    expectMission(/迁移：为什么真实/, { done: false, evidence: false });
    expectMission(/最后用 80 字/, { done: false, evidence: false });
    expectExplorationCount(6);
  });

  it("requires strict real slider targets and keeps target evidence sticky", async () => {
    await renderAppAt("/labs/image-encoding");

    setSlider(slider(/空间采样/), 50);
    expectMission(/把空间采样调到/, { done: false, evidence: false });
    setSlider(slider(/空间采样/), 49);
    expectMission(/把空间采样调到/, { done: true, evidence: true });
    setSlider(slider(/空间采样/), 100);
    expectMission(/把空间采样调到/, { done: true, evidence: true });

    setSlider(slider(/颜色位深/), 3);
    expectMission(/把颜色位深调到/, { done: false, evidence: false });
    setSlider(slider(/颜色位深/), 2);
    expectMission(/把颜色位深调到/, { done: true, evidence: true });
    setSlider(slider(/颜色位深/), 8);
    expectMission(/把颜色位深调到/, { done: true, evidence: true });
  });

  it("does not let a deep link fabricate exploration evidence", async () => {
    await renderAppAt(
      "/labs/image-encoding?image=checkerboard&sample=25&bits=2&view=representation",
    );

    expect(slider(/空间采样/)).toHaveValue("25");
    expect(slider(/颜色位深/)).toHaveValue("2");
    expect(screen.getByRole("tab", { name: /编码表示/ })).toHaveAttribute("aria-selected", "true");
    expectExplorationCount(0);
    expectMission(/把空间采样调到/, { done: false, evidence: false });
    expectMission(/采样重建.*记录一种变化/, { done: false, evidence: false });
    expectMission(/把颜色位深调到/, { done: false, evidence: false });
    expectMission(/切换到“量化重建”，记录一种变化/, { done: false, evidence: false });
    expectMission(/打开编码表示并点击一个像素/, { done: false, evidence: false });
    expectMission(/用公式核对/, { done: false, evidence: false });
  });

  it("keeps fresh lesson copy exploratory across intro, mission, evidence, and payload regions", async () => {
    await renderAppAt("/labs/image-encoding");

    const intro = sectionByHeading(/从真实图像到有限的像素编码/, 2);
    expect(intro).not.toHaveTextContent(/网页缩小|保持与原图相同的显示尺寸|像素化/);

    const mission = sectionByHeading(/把图像送进一条低带宽通道/, 3);
    expect(mission).not.toHaveTextContent(
      /编码采样数量减少，但显示画布仍保持同样大小|来自采样密度，而不是颜色位深|观察有限调色板，以及颜色渐变如何出现色带|圈出/,
    );

    const compare = sectionByHeading(/原图 → 采样值 → 量化重建/, 3);
    expect(compare).not.toHaveTextContent(/显示尺寸相同|空间损失|颜色损失/);

    const evidenceView = sectionByHeading(/让表示过程可见/, 3);
    expect(evidenceView).not.toHaveTextContent(/有限调色板.*色带|降低颜色位深.*减少可用状态/);

    const payload = sectionByHeading(/载荷记录/, 3);
    expect(payload).not.toHaveTextContent(/不是 PNG\/JPEG 文件大小|不包含.*压缩/);
  });

  it("keeps Deep Dive closed and gates explanation on matching evidence", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding");

    const deepDive = sectionByHeading(/继续追问：机器究竟保存了什么/, 3);
    expect(deepDive.querySelectorAll("details[open]")).toHaveLength(0);
    expect(deepDive).not.toHaveTextContent(/编码单元数量真的变少了/);

    setSlider(slider(/空间采样/), 49);
    await user.click(screen.getByRole("tab", { name: /采样重建/ }));

    expect(deepDive.querySelectorAll("details[open]")).toHaveLength(0);
    expect(deepDive).toHaveTextContent(/编码单元数量真的变少了/);
  });

  it("preserves evidence across ordinary view changes but clears it for source, query, and reset changes", async () => {
    const user = userEvent.setup();
    const { router } = await renderAppAt("/labs/image-encoding");

    setSlider(slider(/空间采样/), 49);
    await user.click(screen.getByRole("tab", { name: /采样重建/ }));
    expectMission(/采样重建.*记录一种变化/, { done: false, evidence: true });

    await user.click(screen.getByRole("tab", { name: /量化重建/ }));
    await user.click(screen.getByRole("tab", { name: /对比：原图 \/ 重建图/ }));
    expectMission(/采样重建.*记录一种变化/, { done: false, evidence: true });

    await user.selectOptions(screen.getByLabelText("内置素材"), "gradient");
    expectExplorationCount(0);
    expectMission(/把空间采样调到/, { done: false, evidence: false });
    expectMission(/采样重建.*记录一种变化/, { done: false, evidence: false });

    setSlider(slider(/空间采样/), 45);
    await user.click(screen.getByRole("tab", { name: /采样重建/ }));
    expectMission(/采样重建.*记录一种变化/, { done: false, evidence: true });

    await navigateApp(router, "/labs/image-encoding?image=checkerboard&sample=25&bits=2");
    expectExplorationCount(0);
    expectMission(/把空间采样调到/, { done: false, evidence: false });
    expectMission(/采样重建.*记录一种变化/, { done: false, evidence: false });

    await unlockSixExplorationEvidence();
    expectExplorationCount(6);
    await user.click(screen.getByRole("button", { name: /恢复样例情境/ }));
    expectExplorationCount(0);
    expectMission(/把空间采样调到/, { done: false, evidence: false });
    expectMission(/把颜色位深调到/, { done: false, evidence: false });
    expectMission(/打开编码表示并点击一个像素/, { done: false, evidence: false });
    expectMission(/用公式核对/, { done: false, evidence: false });
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
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: /编码表示/ }));
    fireEvent.click(screen.getByRole("img", { name: /原始源图像/ }));
    expect(screen.getByText("编码值").parentElement).toHaveTextContent(/3 bits/);
    expect(screen.getByText("状态记录").closest(".image-card-heading")).toHaveTextContent(
      /状态记录/,
    );
  });

  it("switches to an error map without changing the encoded model", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding?image=checkerboard&sample=25&bits=2");
    await user.click(screen.getByRole("tab", { name: /可见误差图/ }));
    expect(screen.getByRole("img", { name: /像素误差图/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /载荷记录/ })).toBeInTheDocument();
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
