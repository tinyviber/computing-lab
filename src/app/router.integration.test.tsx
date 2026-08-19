import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { navigateApp, renderAppAt } from "../test/router-test-helpers";

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("application router integration", () => {
  it.each([
    [
      "image lesson",
      "/labs/image-encoding?image=checkerboard&sample=25&bits=2&view=representation",
      /图像编码 workspace/i,
      /12 × 8 编码采样网格/,
    ],
    [
      "audio lesson",
      "/labs/audio-encoding?source=high-pulse&sampleRate=16000&bitDepth=12",
      /声音编码 workspace/i,
      /高频脉冲|16.?000|12.?bit/i,
    ],
    [
      "network lesson",
      "/labs/home-network?scenario=wrong-gateway",
      /家庭网络探针 workspace/i,
      /发送探针|事件链/,
    ],
    [
      "two's-complement lesson",
      "/labs/twos-complement?width=4&a=0111&b=0001&reading=signed",
      /二进制补码 workspace/i,
      /有符号溢出：有/,
    ],
    [
      "program execution lesson",
      "/labs/program-execution?fixture=zero-iterations",
      /程序执行 workspace/i,
      /执行一步|程序步骤/,
    ],
    [
      "protocol process lesson",
      "/labs/protocol-process?scenario=request-loss",
      /可靠送达 workspace/i,
      /运行到结束|消息情境/,
    ],
    ["UTF-8 lesson", "/labs/utf8?scenario=emoji", /UTF-8 编码 workspace/i, /运行到结束|UTF-8 样例/],
    [
      "Monte Carlo lesson",
      "/labs/monte-carlo?scenario=small",
      /蒙特卡洛 π workspace/,
      /运行到结束|蒙特卡洛样例/,
    ],
    [
      "relational data lesson",
      "/labs/relational-data",
      /关系数据 workspace/i,
      /运行到结束|关系数据情境/,
    ],
    [
      "byte edit lesson",
      "/labs/byte-edit?scenario=accent",
      /字节编辑 workspace/i,
      /应用编辑|字节编辑样例/,
    ],
  ])("hydrates %s from a direct query URL", async (_name, entry, landmark, expected) => {
    await renderAppAt(entry);
    expect(document.querySelector("main")).toHaveAccessibleName(landmark);
    if (_name === "image lesson") {
      expect(screen.getByRole("grid", { name: expected })).toBeInTheDocument();
    } else if (_name === "audio lesson") {
      expect(document.body).toHaveTextContent(expected);
    } else if (_name === "network lesson") {
      expect(screen.getByRole("heading", { level: 1, name: "家庭网络探针" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /发送探针/ })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: /事件链/i })).toBeInTheDocument();
    } else if (_name === "program execution lesson") {
      expect(screen.getByRole("button", { name: "执行一步" })).toBeInTheDocument();
      expect(screen.getByRole("list", { name: "程序步骤" })).toBeInTheDocument();
    } else if (_name === "protocol process lesson") {
      expect(screen.getByRole("button", { name: "运行到结束" })).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /消息情境/i })).toHaveValue("request-loss");
    } else if (_name === "UTF-8 lesson") {
      expect(screen.getByRole("button", { name: "运行到结束" })).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /UTF-8 样例/ })).toHaveValue("emoji");
    } else if (_name === "Monte Carlo lesson") {
      expect(screen.getByRole("button", { name: "运行到结束" })).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /蒙特卡洛样例/ })).toHaveValue("small");
    } else if (_name === "relational data lesson") {
      expect(screen.getByRole("button", { name: "运行到结束" })).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /关系数据情境/i })).toHaveValue("catalog");
    } else if (_name === "byte edit lesson") {
      expect(screen.getByRole("button", { name: "应用编辑" })).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /字节编辑样例/ })).toHaveValue("accent");
    } else {
      expect(screen.getByRole("heading", { level: 3, name: expected })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "A，第 3 位，0" })).toBeInTheDocument();
    }
  });

  it("hydrates a base-prefixed deep link with the test router history", async () => {
    await renderAppAt(
      "/computing-lab/labs/image-encoding?image=checkerboard&sample=25",
      "/computing-lab",
    );
    expect(document.querySelector("h1")).toHaveTextContent("图像编码");
    expect(screen.getByRole("grid", { name: /12 × 8 编码采样网格/ })).toBeInTheDocument();
  });

  it("changes image lesson state when the same route receives a new search", async () => {
    const { router } = await renderAppAt("/labs/image-encoding");
    expect(screen.getByRole("grid", { name: /24 × 16 编码采样网格/ })).toBeInTheDocument();
    await navigateApp(router, "/labs/image-encoding?image=gradient&sample=25&bits=2&view=error");
    expect(screen.getByRole("slider", { name: /空间采样/ })).toHaveValue("25");
    expect(screen.getByRole("img", { name: /像素误差图/ })).toBeInTheDocument();
    expect(document.body).toHaveTextContent("12 × 8 × 2 = 192 位");
  });

  it("changes Sound lesson state when the same route receives a new canonical search", async () => {
    const { router } = await renderAppAt("/labs/audio-encoding?source=pure440");
    expect(document.body).toHaveTextContent(/pure440/i);
    await navigateApp(
      router,
      "/labs/audio-encoding?source=sawtooth&sampleRate=16000&bitDepth=12&mode=quantization&view=levels",
    );
    expect(document.body).toHaveTextContent(/sawtooth/i);
    expect(document.body).toHaveTextContent(/quantization|levels/i);
  });

  it("changes network lesson state when the same route receives a new search", async () => {
    const { router } = await renderAppAt("/labs/home-network");
    expect(screen.getByRole("heading", { level: 1, name: "家庭网络探针" })).toBeInTheDocument();
    await navigateApp(router, "/labs/home-network?scenario=wrong-gateway");
    expect(screen.getByRole("heading", { level: 1, name: "家庭网络探针" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /发送探针/ }));
    expect(screen.getByRole("region", { name: /事件链/i })).toHaveTextContent(
      /gateway-unresolved|gateway|arp/i,
    );
  });

  it("refreshes the UTF-8 reset baseline when the same route receives a new search", async () => {
    const { router } = await renderAppAt("/labs/utf8?scenario=emoji");
    await userEvent.setup().click(screen.getByRole("button", { name: "运行到结束" }));
    await navigateApp(router, "/labs/utf8?scenario=ascii");
    expect(screen.getByRole("combobox", { name: /UTF-8 样例/ })).toHaveValue("ascii");
    await userEvent.setup().click(screen.getByRole("button", { name: "恢复初始情境" }));
    expect(screen.getByRole("combobox", { name: /UTF-8 样例/ })).toHaveValue("ascii");
  });

  it("navigates between lessons through real router links without a document reload", async () => {
    const user = userEvent.setup();
    const { router } = await renderAppAt("/labs/image-encoding");
    await user.click(document.querySelector('a.lab-link[href="/labs/audio-encoding"]')!);
    await router.load();
    expect(document.querySelector("h1")).toHaveTextContent("声音编码");
    await user.click(document.querySelector('a.lab-link[href="/labs/home-network"]')!);
    await router.load();
    expect(document.querySelector("h1")).toHaveTextContent("家庭网络探针");
    expect(screen.getByRole("button", { name: /发送探针/ })).toBeInTheDocument();
  });

  it.each([
    ["image", "/labs/image-encoding"],
    ["audio", "/labs/audio-encoding"],
    ["network", "/labs/home-network"],
    ["two's-complement", "/labs/twos-complement?width=4&a=0111&b=0001&reading=signed"],
  ])(
    "does not replace browser history methods while mounting the %s lesson",
    async (_name, entry) => {
      const originalPushState = window.history.pushState;
      const originalReplaceState = window.history.replaceState;
      const { unmount } = await renderAppAt(entry);
      expect(window.history.pushState).toBe(originalPushState);
      expect(window.history.replaceState).toBe(originalReplaceState);
      unmount();
      expect(window.history.pushState).toBe(originalPushState);
      expect(window.history.replaceState).toBe(originalReplaceState);
    },
  );
});
