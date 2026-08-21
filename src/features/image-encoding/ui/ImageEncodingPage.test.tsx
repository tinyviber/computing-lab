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

const evidenceStatus = /(?:相关)?证据(?:已解锁|已出现|可用)/;

function taskItem(title: RegExp): HTMLElement {
  const task = [...document.querySelectorAll(".mission-item")].find((candidate) =>
    title.test(candidate.textContent ?? ""),
  );
  if (!(task instanceof HTMLElement)) throw new Error(`Task item not found: ${title}`);
  return task;
}

function expectTaskEvidence(title: RegExp, expected: boolean) {
  const task = taskItem(title);
  if (expected) {
    expect(task).toHaveTextContent(evidenceStatus);
  } else {
    expect(task).not.toHaveTextContent(evidenceStatus);
  }
}

function sectionByHeading(name: RegExp, level: 2 | 3): HTMLElement {
  const section = screen.getByRole("heading", { level, name }).closest("section, header");
  if (!(section instanceof HTMLElement)) throw new Error(`Section not found: ${name}`);
  return section;
}

describe("ImageEncodingPage", () => {
  it("uses classroom language for teacher assignments and learner observations", async () => {
    await renderAppAt("/labs/image-encoding");

    expect(screen.getByRole("main")).toHaveTextContent(/教师(?:布置|设定)/);
    expect(screen.getByRole("main")).toHaveTextContent(/学生调整参数/);
    expect(screen.getByRole("main")).toHaveTextContent(/观察/);
    expect(screen.getByRole("main")).toHaveTextContent(/记录/);
    expect(screen.getAllByText(/拖动滑杆（也可聚焦后用方向键）/)).toHaveLength(2);
  });

  it("does not expose progress, exploration-score, or game-like legend copy", async () => {
    await renderAppAt("/labs/image-encoding");

    expect(document.body).not.toHaveTextContent(/0\s*\/\s*6/);
    expect(document.body).not.toHaveTextContent(/探索证据/);
    expect(document.body).not.toHaveTextContent(/圆形|胶囊|图例|游戏化/);
    expect(document.querySelector('[aria-label*="探索证据"]')).toBeNull();
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
      screen.getByRole("heading", { level: 2, name: /从图像到有限的像素编码/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /本节使用的图像/ })).toBeInTheDocument();
    expect(screen.getAllByText("小猫照片")).toHaveLength(2);
    expect(screen.queryByLabelText("内置素材")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: /把一个像素拆成数字/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/step 1/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /提交编码/ })).not.toBeInTheDocument();
  });

  it("renders image course outline as a neutral feature-local map", async () => {
    await renderAppAt("/labs/image-encoding");

    const outline = screen.getByRole("navigation", { name: "图像编码学习流程" });
    expect(outline).toHaveTextContent(/任务单/);
    expect(outline).toHaveTextContent(/观察重建/);
    expect(outline).toHaveTextContent(/看像素怎样变成数字/);
    expect(outline).toHaveTextContent(/联系实际/);
    expect(outline.querySelector(".is-current")).toBeNull();
    expect(outline).not.toHaveTextContent(/进行中/);
  });

  it("uses one native worksheet disclosure with a direct task list and stable evidence", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding");

    const worksheet = document.querySelector("details.mission-card");
    if (!(worksheet instanceof HTMLDetailsElement)) throw new Error("Worksheet details not found");
    const summary = worksheet.querySelector("summary");
    if (!(summary instanceof HTMLElement)) throw new Error("Task summary not found");
    const task = taskItem(/空间采样|调整参数/);
    expect(worksheet).not.toHaveAttribute("open");
    expect(worksheet.querySelectorAll("details")).toHaveLength(0);
    expect(task).toHaveTextContent(/空间采样|调整参数/);

    setSlider(slider(/空间采样/), 45);
    const evidenceBefore = task.textContent;
    summary.focus();
    expect(summary).toHaveFocus();
    await user.click(summary);
    expect(worksheet).toHaveAttribute("open", "");
    expect(within(worksheet).getAllByRole("listitem")).toHaveLength(10);
    expect(worksheet.querySelectorAll("details")).toHaveLength(0);
    expect(task.querySelector("p")).toBeInTheDocument();
    expect(task).toHaveTextContent(/证据已出现/);
    expect(task).toHaveTextContent(/仍需学生记录、描述、计算或解释/);
    expect(task.textContent).toBe(evidenceBefore);

    await user.click(summary);
    expect(worksheet).not.toHaveAttribute("open");
    expect(task.textContent).toBe(evidenceBefore);
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

  it("requires strict real slider targets and keeps target evidence sticky", async () => {
    await renderAppAt("/labs/image-encoding");

    setSlider(slider(/空间采样/), 50);
    expectTaskEvidence(/空间采样/, false);
    setSlider(slider(/空间采样/), 49);
    expectTaskEvidence(/空间采样/, true);
    setSlider(slider(/空间采样/), 100);
    expectTaskEvidence(/空间采样/, true);

    setSlider(slider(/颜色位深/), 3);
    expectTaskEvidence(/颜色位深/, false);
    setSlider(slider(/颜色位深/), 2);
    expectTaskEvidence(/颜色位深/, true);
    setSlider(slider(/颜色位深/), 8);
    expectTaskEvidence(/颜色位深/, true);
  });

  it("does not let a deep link fabricate exploration evidence", async () => {
    await renderAppAt(
      "/labs/image-encoding?image=checkerboard&sample=25&bits=2&view=representation",
    );

    expect(slider(/空间采样/)).toHaveValue("25");
    expect(slider(/颜色位深/)).toHaveValue("2");
    expect(screen.getByRole("tab", { name: /编码表示/ })).toHaveAttribute("aria-selected", "true");
    expectTaskEvidence(/空间采样/, false);
    expectTaskEvidence(/颜色位深/, false);
  });

  it("keeps the lesson copy observational rather than revealing conclusions", async () => {
    await renderAppAt("/labs/image-encoding");

    expect(screen.getByRole("main")).toHaveTextContent(/教师(?:布置|设定)/);
    expect(screen.getByRole("main")).toHaveTextContent(/学生调整参数/);
    expect(screen.getByRole("main")).toHaveTextContent(/观察.*记录/);
    expect(document.body).not.toHaveTextContent(/0\s*\/\s*6|探索证据|可直接开始/);
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
    expectTaskEvidence(/采样重建/, true);

    await user.click(screen.getByRole("tab", { name: /量化重建/ }));
    await user.click(screen.getByRole("tab", { name: /对比：原图 \/ 重建图/ }));
    expectTaskEvidence(/采样重建/, true);

    await navigateApp(router, "/labs/image-encoding?image=gradient&sample=25&bits=8");
    expectTaskEvidence(/空间采样/, false);
    expectTaskEvidence(/采样重建/, false);

    setSlider(slider(/空间采样/), 45);
    await user.click(screen.getByRole("tab", { name: /采样重建/ }));
    expectTaskEvidence(/采样重建/, true);

    await navigateApp(router, "/labs/image-encoding?image=checkerboard&sample=25&bits=2");
    expectTaskEvidence(/空间采样/, false);
    expectTaskEvidence(/采样重建/, false);

    setSlider(slider(/空间采样/), 45);
    await user.click(screen.getByRole("tab", { name: /采样重建/ }));
    expectTaskEvidence(/采样重建/, true);
    await user.click(screen.getByRole("button", { name: /恢复固定样例/ }));
    expectTaskEvidence(/空间采样/, false);
    expectTaskEvidence(/颜色位深/, false);
    expectTaskEvidence(/采样重建/, false);
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
    expect(screen.getByText("颜色编号记录").closest(".image-card-heading")).toHaveTextContent(
      /颜色编号记录/,
    );
  });

  it("switches to an error map without changing the encoded model", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding?image=checkerboard&sample=25&bits=2");
    await user.click(screen.getByRole("tab", { name: /颜色差异图/ }));
    expect(screen.getByRole("img", { name: /像素误差图/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /原始数据量/ })).toBeInTheDocument();
    expect(screen.queryByText(/compression ratio/i)).not.toBeInTheDocument();
  });

  it("keeps the feature layout inside the app main and supports reset", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding?image=gradient&sample=25&bits=2");
    setSlider(slider(/空间采样/), 90);
    await user.click(screen.getByRole("button", { name: /恢复固定样例/ }));
    expect(slider(/空间采样/)).toHaveValue("25");
    expect(
      screen.getByRole("heading", { level: 3, name: /把一个像素拆成数字/ }).closest("main"),
    ).toBe(screen.getByRole("main"));
    expect(screen.getByRole("grid").closest("#lab-navigation")).toBeNull();
  });
});
