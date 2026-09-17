import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { stageIndex: number };
        const details: Record<number, string> = {
          1: "这一行的编码和系统一致。",
          2: "在预算内，目标区域平均颜色误差 8.0%（≤ 12%）。",
          3: "改了 8 个像素，编码完全相同。",
        };
        return new Response(
          JSON.stringify({
            passed: true,
            detail: details[body.stageIndex],
            currentStage: Math.min(5, body.stageIndex + 1),
            passedStages: Array.from({ length: body.stageIndex }, (_, index) => index + 1),
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (init?.method === "PUT") {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          currentStage: 1,
          passedStages: [],
          artifact: { image: "photo", resStop: 50, colorStop: "palette4" },
          draft: {},
        }),
        { headers: { "content-type": "application/json" } },
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openStage(name: RegExp) {
  await userEvent.click(screen.getByRole("button", { name }));
}

async function passCore1() {
  fireEvent.change(screen.getByRole("textbox", { name: "高亮行的 16 bit" }), {
    target: { value: "0111010101011001" },
  });
  await userEvent.click(screen.getByRole("button", { name: "检查编码" }));
  await screen.findByText("这一行的编码和系统一致。");
}

async function passCore2() {
  await openStage(/02.*在预算内保存/);
  await userEvent.click(screen.getByRole("button", { name: "25%" }));
  await userEvent.click(screen.getByRole("button", { name: "RGB 24 位" }));
  await userEvent.click(screen.getByRole("button", { name: "保存这张老照片" }));
  await screen.findByText(/在预算内，目标区域平均颜色误差/);
}

async function passCore3() {
  await openStage(/03.*丢掉的信息回不来/);
  for (const x of [0, 2, 4, 6, 8, 10, 12, 14]) {
    await userEvent.click(screen.getByRole("button", { name: `像素 ${x},0` }));
  }
  await userEvent.click(screen.getByRole("button", { name: "检查是否 many-to-one" }));
  await screen.findByText("改了 8 个像素，编码完全相同。");
}

describe("ImageEncodingPage", () => {
  it("presents three core stages and two locked challenges", async () => {
    await renderAppAt("/classes/c1/labs/image-encoding");

    expect(screen.getByRole("main", { name: "AI 修复老照片实验区" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: /AI 是找回了丢失的像素，还是生成了一个看起来合理的版本/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "约定决定 bit 的意义" })).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /CORE/ })).toHaveLength(0);
    expect(screen.getByRole("button", { name: /04.*AI 修复/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /05.*抓幻觉/ })).toBeDisabled();
  });

  it("checks a hand-encoded row and reveals a different decoder convention", async () => {
    const user = userEvent.setup();
    await renderAppAt("/classes/c1/labs/image-encoding");

    fireEvent.change(screen.getByRole("textbox", { name: "高亮行的 16 bit" }), {
      target: { value: "0111" },
    });
    await user.click(screen.getByRole("button", { name: "检查编码" }));
    expect(screen.getByRole("status")).toHaveTextContent("还差 12 位");

    await passCore1();
    expect(screen.getByRole("status")).toHaveTextContent("通过");
    expect(screen.getByRole("status")).toHaveTextContent("编码和系统一致");
    await user.click(screen.getByRole("button", { name: "用约定 B 解码同一串 bit" }));
    expect(screen.getByRole("img", { name: /约定 B · 彩色/ })).toBeInTheDocument();
    expect(screen.getByText(/bit 没有变，图却变了/)).toBeInTheDocument();
  });

  it("requires both the bit budget and target-region fidelity", async () => {
    const user = userEvent.setup();
    await renderAppAt("/classes/c1/labs/image-encoding");
    await openStage(/02.*在预算内保存/);

    await user.click(screen.getByRole("button", { name: "100%" }));
    await user.click(screen.getByRole("button", { name: "RGB 24 位" }));
    await user.click(screen.getByRole("button", { name: "保存这张老照片" }));
    expect(screen.getByRole("status")).toHaveTextContent("超出预算");

    await user.click(screen.getByRole("button", { name: "25%" }));
    await user.click(screen.getByRole("button", { name: "保存这张老照片" }));
    await screen.findByText(/在预算内，目标区域平均颜色误差/);
    expect(screen.getByRole("status")).toHaveTextContent("通过");
    expect(screen.getByRole("status")).toHaveTextContent("平均颜色误差");
    expect(screen.getByText(/不是 PNG、JPEG 或 WebP 的实际文件大小/)).toBeInTheDocument();
  });

  it("lets the learner make a different source with an identical encoding", async () => {
    await renderAppAt("/classes/c1/labs/image-encoding");
    await openStage(/03.*丢掉的信息回不来/);

    expect(screen.getByText("0 / 至少 8")).toBeInTheDocument();
    for (const x of [0, 2, 4, 6, 8, 10, 12, 14]) {
      await userEvent.click(screen.getByRole("button", { name: `像素 ${x},0` }));
    }
    expect(screen.getByText("8 / 至少 8")).toBeInTheDocument();
    expect(screen.getByText("完全相同")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "检查是否 many-to-one" }));
    await screen.findByText("改了 8 个像素，编码完全相同。");
    expect(screen.getByRole("status")).toHaveTextContent("改了 8 个像素，编码完全相同");
  });

  it("unlocks challenges only after all core checks pass", async () => {
    await renderAppAt("/classes/c1/labs/image-encoding");

    await passCore1();
    await passCore2();
    await passCore3();

    const restore = screen.getByRole("button", { name: /04.*AI 修复/ });
    expect(restore).toBeEnabled();
    await userEvent.click(restore);
    expect(screen.getByRole("heading", { name: "普通放大忠实，AI 修复会猜" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "photo 的 AI 修复结果" })).toHaveAttribute(
      "src",
      "/labs/image-encoding/restored/photo-25-rgb24.webp",
    );
    expect(screen.getByText("AI restored · realesrgan-x4plus")).toBeInTheDocument();
  });

  it("maps legacy URLs to the new artifact and emits a canonical share link", async () => {
    await renderAppAt(
      "/classes/c1/labs/image-encoding?image=gradient&sample=40&bits=8&view=error&showExperimentalLabs=1",
    );

    expect(
      screen.getByRole("heading", { name: "改原图，但让编码一个 bit 都不变" }),
    ).toBeInTheDocument();
    expect(screen.getByText("沿用你的方案：50% 分辨率")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "当前情境链接" })).toHaveAttribute(
      "href",
      "/labs/image-encoding?stage=3&image=gradient&res=50&colors=palette8&showExperimentalLabs=1",
    );
  });

  it("does not let a challenge URL bypass progress", async () => {
    await renderAppAt("/classes/c1/labs/image-encoding?stage=5&image=photo&res=25&colors=gray8");
    expect(screen.getByRole("heading", { name: "约定决定 bit 的意义" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /05.*抓幻觉/ })).toBeDisabled();
  });
});
