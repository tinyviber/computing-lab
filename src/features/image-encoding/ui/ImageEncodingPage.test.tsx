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

function formatButton(label: string): HTMLButtonElement {
  const button = screen.getByRole("button", { name: label, exact: true });
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Format button not found: ${label}`);
  return button;
}

function flowItem(title: RegExp): HTMLElement {
  const item = [...document.querySelectorAll(".lesson-flow-item")].find((candidate) =>
    title.test(candidate.textContent ?? ""),
  );
  if (!(item instanceof HTMLElement)) throw new Error(`Lesson step not found: ${title}`);
  return item;
}

function changeSampling() {
  const sampling = slider(/空间采样/);
  sampling.focus();
  fireEvent.change(sampling, { target: { value: "45" } });
  return sampling;
}

async function unlockCalculator(user: ReturnType<typeof userEvent.setup>) {
  changeSampling();
  await user.click(screen.getByRole("button", { name: "调色板", exact: true }));
  const bitDepth = slider(/颜色位深/);
  fireEvent.change(bitDepth, { target: { value: "2" } });
  return bitDepth;
}

async function unlockFormat(user: ReturnType<typeof userEvent.setup>) {
  await unlockCalculator(user);
  const calculator = sectionByHeading(/数据量计算/, 3);
  fireEvent.change(within(calculator).getByRole("spinbutton", { name: "宽度（像素）" }), {
    target: { value: "119" },
  });
}

describe("ImageEncodingPage", () => {
  it("renders the local source, geometry, and four-step classroom flow", async () => {
    await renderAppAt("/labs/image-encoding");

    expect(screen.getByRole("main", { name: /图像编码实验区/ })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /从图像到有限的像素编码/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("小猫插图")).toHaveLength(2);
    expect(screen.getByText("四步操作")).toBeInTheDocument();
    expect(document.querySelectorAll(".lesson-flow-item")).toHaveLength(4);
    expect(document.querySelectorAll(".mission-item")).toHaveLength(0);
    expect(screen.getByRole("main")).toHaveTextContent(/当前图片 240 × 160 像素/);
    expect(screen.getByRole("main")).toHaveTextContent(/120 × 80 个采样/);
    expect(screen.getByRole("main")).not.toHaveTextContent(/证据|通关|载荷/);
    expect(screen.getByRole("main")).not.toHaveTextContent(/0\s*\/\s*6|10\s*项/);
  });

  it("starts with only spatial sampling enabled and human-readable lock copy", async () => {
    await renderAppAt("/labs/image-encoding");

    expect(slider(/空间采样/)).not.toBeDisabled();
    expect(slider(/采样网格相位/)).toBeDisabled();
    expect(slider(/颜色位深/)).toBeDisabled();
    expect(screen.getByRole("button", { name: "调色板", exact: true })).toBeDisabled();
    const rgb24 = screen.getByRole("button", { name: "原色（RGB 24 位）" });
    expect(rgb24).toBeDisabled();
    expect(rgb24).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/上传图片（可选）/)).toBeEnabled();
    expect(screen.getByRole("group", { name: "图像格式" }).querySelectorAll("button")).toHaveLength(
      4,
    );
    for (const button of within(screen.getByRole("group", { name: "图像格式" })).getAllByRole(
      "button",
    )) {
      expect(button).toBeDisabled();
    }
    for (const tab of screen.getAllByRole("tab")) expect(tab).toBeDisabled();
    for (const input of within(sectionByHeading(/数据量计算/, 3)).getAllByRole("spinbutton")) {
      expect(input).toBeDisabled();
    }
    expect(screen.getByText("完成第 1 步后解锁颜色表示。")).toBeInTheDocument();
    expect(screen.getByText("完成第 3 步后解锁格式边界。")).toBeInTheDocument();
    expect(screen.getByText("完成第 2 步后解锁。")).toBeInTheDocument();
  });

  it("unlocks color controls after a sampling interaction", async () => {
    await renderAppAt("/labs/image-encoding");

    const sampling = changeSampling();
    expect(sampling).toHaveValue("45");
    expect(flowItem(/1\. 改变空间采样百分比/)).toHaveTextContent("已完成");
    expect(flowItem(/2\. 调整颜色表示/)).toHaveTextContent("进行中");
    expect(screen.getByRole("button", { name: "调色板", exact: true })).not.toBeDisabled();
    expect(slider(/采样网格相位/)).not.toBeDisabled();
    expect(screen.getAllByRole("tab").every((tab) => !tab.hasAttribute("disabled"))).toBe(true);
  });

  it("requires raw data calculation before enabling format selection", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding");
    changeSampling();

    await user.click(screen.getByRole("button", { name: "原色（RGB 24 位）" }));
    expect(formatButton("PNG")).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "调色板", exact: true }));
    expect(slider(/颜色位深/)).not.toBeDisabled();
    fireEvent.change(slider(/颜色位深/), { target: { value: "2" } });
    expect(formatButton("未压缩 / 原始")).toBeDisabled();
    expect(formatButton("PNG")).toBeDisabled();
    expect(formatButton("JPG / JPEG")).toBeDisabled();
    expect(formatButton("WebP")).toBeDisabled();
    expect(flowItem(/2\. 调整颜色表示/)).toHaveTextContent("已完成");
    expect(flowItem(/3\. 计算原始数据量/)).toHaveTextContent("进行中");

    const calculator = sectionByHeading(/数据量计算/, 3);
    fireEvent.change(within(calculator).getByRole("spinbutton", { name: "宽度（像素）" }), {
      target: { value: "119" },
    });
    expect(formatButton("未压缩 / 原始")).not.toBeDisabled();
    expect(formatButton("PNG")).not.toBeDisabled();
    expect(formatButton("JPG / JPEG")).not.toBeDisabled();
    expect(formatButton("WebP")).not.toBeDisabled();
    expect(flowItem(/4\. 了解文件格式边界/)).toHaveTextContent("进行中");
  });

  it("lets a bits=1 scenario complete the color step", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding?bits=1");
    changeSampling();
    expect(screen.getByText("切换到调色板后解锁。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "调色板", exact: true }));

    expect(flowItem(/2\. 调整颜色表示/)).toHaveTextContent("已完成");
    expect(
      screen.getByText("当前已经是最低的 1 位；切换到调色板即可完成这一步。"),
    ).toBeInTheDocument();
    expect(
      within(sectionByHeading(/数据量计算/, 3)).getByRole("spinbutton", {
        name: "宽度（像素）",
      }),
    ).toBeEnabled();
    expect(formatButton("PNG")).toBeDisabled();
  });

  it.each(["未压缩 / 原始", "PNG", "JPG / JPEG", "WebP"])(
    "keeps format choice and explains why compressed size varies for %s",
    async (label) => {
      const user = userEvent.setup();
      await renderAppAt("/labs/image-encoding");
      await unlockFormat(user);
      await user.click(formatButton(label));

      const payload = sectionByHeading(/原始数据量/, 3);
      const calculator = sectionByHeading(/数据量计算/, 3);
      expect(formatButton(label)).toHaveAttribute("aria-pressed", "true");
      expect(payload).toHaveTextContent(/实际文件大小取决于图像内容/);
      expect(payload).not.toHaveTextContent(/教学估算/);
      expect(calculator).toHaveTextContent(/原始字节/);
      expect(calculator).not.toHaveTextContent(/教学估算/);
    },
  );

  it("unlocks an accessible editable calculator with the explicit formula", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding");
    await unlockFormat(user);

    const calculator = sectionByHeading(/数据量计算/, 3);
    expect(flowItem(/3\. 计算原始数据量/)).toHaveTextContent("已完成");
    const width = within(calculator).getByRole("spinbutton", { name: "宽度（像素）" });
    const height = within(calculator).getByRole("spinbutton", { name: "高度（像素）" });
    const bits = within(calculator).getByRole("spinbutton", { name: "每像素位数" });
    expect(width).not.toBeDisabled();
    expect(height).not.toBeDisabled();
    expect(bits).not.toBeDisabled();

    fireEvent.change(width, { target: { value: "3" } });
    fireEvent.change(height, { target: { value: "3" } });
    fireEvent.change(bits, { target: { value: "5" } });
    expect(width).toHaveValue(3);
    expect(height).toHaveValue(3);
    expect(bits).toHaveValue(5);
    expect(calculator).toHaveTextContent(/原始位数 = 宽度 × 高度 × 每像素位数/);
    expect(calculator).toHaveTextContent(/3 × 3 × 5 = 45 位/);
    expect(calculator).toHaveTextContent(/45 ÷ 8 后向上取整 = 6 字节/);
    expect(calculator).toHaveTextContent(/压缩格式的实际大小取决于图像内容和编码器设置/);
    expect(flowItem(/4\. 了解文件格式边界/)).toHaveTextContent("进行中");
    await user.click(formatButton("PNG"));
    expect(flowItem(/4\. 了解文件格式边界/)).toHaveTextContent("已完成");
  });

  it("does not let a URL deep link bypass the sequential locks", async () => {
    await renderAppAt(
      "/labs/image-encoding?image=checkerboard&sample=25&phase=0.5&bits=2&color=palette&view=representation",
    );

    expect(slider(/空间采样/)).toHaveValue("25");
    expect(slider(/颜色位深/)).toBeDisabled();
    expect(screen.getByRole("button", { name: "调色板", exact: true })).toBeDisabled();
    expect(formatButton("PNG")).toBeDisabled();
    expect(screen.getByRole("tab", { name: /编码表示/ })).toBeDisabled();
    expect(
      within(sectionByHeading(/数据量计算/, 3)).getByText("完成第 2 步后解锁。"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/原始位数 = 宽度 × 高度 × 每像素位数/)).not.toBeInTheDocument();
    expect(flowItem(/1\. 改变空间采样百分比/)).toHaveTextContent("进行中");
    expect(flowItem(/4\. 了解文件格式边界/)).toHaveTextContent("待解锁");
  });

  it("clears progress on reset, URL scenario changes, and upload attempts", async () => {
    const user = userEvent.setup();
    const { router } = await renderAppAt("/labs/image-encoding");
    await unlockFormat(user);
    await user.click(formatButton("PNG"));

    const reset = within(sectionByHeading(/本节使用的图像/, 3)).getByRole("button", {
      name: "恢复初始情境",
    });
    await user.click(reset);
    expect(slider(/空间采样/)).toHaveValue("50");
    expect(screen.getByRole("button", { name: "调色板", exact: true })).toBeDisabled();
    expect(formatButton("PNG")).toBeDisabled();
    expect(
      within(sectionByHeading(/数据量计算/, 3)).getByRole("spinbutton", { name: "宽度（像素）" }),
    ).toBeDisabled();

    changeSampling();
    await navigateApp(
      router,
      "/labs/image-encoding?image=gradient&sample=25&color=palette&bits=2&view=representation",
    );
    expect(slider(/空间采样/)).toHaveValue("25");
    expect(formatButton("PNG")).toBeDisabled();
    expect(flowItem(/1\. 改变空间采样百分比/)).toHaveTextContent("进行中");

    changeSampling();
    await user.click(screen.getByRole("button", { name: "调色板", exact: true }));
    fireEvent.change(slider(/颜色位深/), { target: { value: "1" } });
    fireEvent.change(
      within(sectionByHeading(/数据量计算/, 3)).getByRole("spinbutton", {
        name: "宽度（像素）",
      }),
      { target: { value: "119" } },
    );
    await user.click(formatButton("PNG"));
    const upload = screen.getByLabelText(/上传图片（可选）/);
    vi.stubGlobal("Image", undefined);
    try {
      fireEvent.change(upload, {
        target: {
          files: [new File(["not an image"], "not-an-image.png", { type: "image/png" })],
        },
      });
      await screen.findByRole("alert");
    } finally {
      vi.unstubAllGlobals();
    }
    expect(slider(/空间采样/)).toHaveValue("45");
    expect(screen.getByRole("button", { name: "调色板", exact: true })).toBeEnabled();
    expect(formatButton("PNG")).toHaveAttribute("aria-pressed", "true");
    expect(
      within(sectionByHeading(/数据量计算/, 3)).getByRole("spinbutton", { name: "宽度（像素）" }),
    ).toBeEnabled();
  });

  it("clears progress after a successful upload", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding");
    await unlockFormat(user);
    await user.click(formatButton("PNG"));

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
      const upload = screen.getByLabelText(/上传图片（可选）/);
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
    expect(screen.getByRole("button", { name: "调色板", exact: true })).toBeDisabled();
    expect(formatButton("PNG")).toBeDisabled();
    expect(
      within(sectionByHeading(/数据量计算/, 3)).getByRole("spinbutton", {
        name: "宽度（像素）",
      }),
    ).toBeDisabled();
  });

  it("keeps rounded geometry, source identity, and legacy fixture URLs", async () => {
    const { router } = await renderAppAt(
      "/labs/image-encoding?image=checkerboard&sample=99&phase=0.8",
    );
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

    for (const [fixture, label] of [
      ["gradient", "平滑色彩渐变"],
      ["checkerboard", "细棋盘格"],
    ] as const) {
      await navigateApp(
        router,
        `/labs/image-encoding?image=${fixture}&sample=25&bits=2&view=representation`,
      );
      expect(screen.getAllByText(label)).toHaveLength(2);
      expect(screen.getAllByText(label)[0]).toBeVisible();
      expect(screen.queryByText("小猫插图")).not.toBeInTheDocument();
      expect(screen.getByRole("grid", { name: /12 × 8 编码采样网格/ })).toBeInTheDocument();
      expect(screen.getByRole("img", { name: /原始源图像/ })).toHaveAttribute("width", "48");
      expect(screen.getByRole("img", { name: /重建图像/ })).toHaveAttribute("width", "48");
    }
  });

  it("keeps source and reconstruction at the same display size and exposes pixel details after sampling", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/image-encoding?image=photo&sample=25&bits=4");
    expect(screen.getByRole("img", { name: /原始源图像/ })).toHaveAttribute("width", "240");
    expect(screen.getByRole("img", { name: /原始源图像/ })).toHaveAttribute("height", "160");
    expect(screen.getByRole("img", { name: /重建图像/ })).toHaveAttribute("width", "240");
    expect(screen.getByRole("img", { name: /重建图像/ })).toHaveAttribute("height", "160");

    changeSampling();
    await user.click(screen.getByRole("tab", { name: /编码表示/ }));
    fireEvent.click(screen.getByRole("img", { name: /原始源图像/ }));
    expect(screen.getByText("编码值").parentElement).toHaveTextContent(/24 bits/);
    expect(screen.getByRole("heading", { name: /RGB 颜色/ })).toBeInTheDocument();
  });
});
