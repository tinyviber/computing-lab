import userEvent from "@testing-library/user-event";
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  anonymousAuthState,
  navigateApp,
  renderAppAt,
  studentAuthState,
  teacherAuthState,
} from "../test/router-test-helpers";

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("application router integration", () => {
  it("shows the signed-in name only inside the account dropdown trigger", async () => {
    await renderAppAt("/");

    const topbar = screen.getByRole("banner");
    expect(within(topbar).getAllByText("教师", { exact: true })).toHaveLength(1);
    expect(within(topbar).getByRole("button", { name: /教师/ })).toBeInTheDocument();
    expect(within(topbar).queryByText("teacher", { exact: true })).not.toBeInTheDocument();
  });

  it("shows a teacher the classroom home with the enabled lab and flagged experiments", async () => {
    await renderAppAt("/");

    // The enabled lab links to its class-scoped route.
    const calculatorLinks = screen.getAllByRole("link", { name: /实现ALU|开始|继续/ });
    expect(
      calculatorLinks.some((link) => link.getAttribute("href") === "/classes/c1/labs/calculator"),
    ).toBe(true);

    // Hidden labs are visible to a teacher but labelled.
    const imageLinks = screen.getAllByRole("link", { name: /图像编码/ });
    expect(imageLinks.map((link) => link.getAttribute("href"))).toContain("/labs/image-encoding");
    expect(screen.getAllByText("未开放").length).toBeGreaterThan(0);

    // The teacher dashboard card is present.
    expect(screen.getByRole("link", { name: /打开看板/ })).toHaveAttribute(
      "href",
      "/classes/c1/dashboard",
    );

    for (const legacyPhrase of [
      /不先背结论/,
      /把一个系统拆开/,
      /开始图像编码/,
      /先做一个看得见的实验/,
      /可直接开始/,
    ]) {
      expect(screen.queryByText(legacyPhrase)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: /继续图像编码/ })).not.toBeInTheDocument();
  });

  it("shows anonymous visitors a landing page with a sign-in entry", async () => {
    await renderAppAt("/", { auth: anonymousAuthState });

    expect(screen.getByRole("heading", { name: "计算实验室" })).toBeInTheDocument();
    const entry = screen.getByRole("link", { name: /登录 \/ 加入班级/ });
    expect(entry).toHaveAttribute("href", "/login");

    // No lab links are offered to an anonymous visitor.
    expect(screen.queryByRole("link", { name: /进入实验/ })).not.toBeInTheDocument();
    expect(screen.queryByText("交互式计算实验")).not.toBeInTheDocument();
    for (const legacyPhrase of [/不先背结论/, /把一个系统拆开/, /可直接开始/]) {
      expect(screen.queryByText(legacyPhrase)).not.toBeInTheDocument();
    }
  });

  it("hides a disabled lab from students and opens it with the override or as teacher", async () => {
    // A student is refused.
    const refused = await renderAppAt("/labs/image-encoding", { auth: studentAuthState });
    expect(screen.getByRole("heading", { name: /图像编码暂未开放/ })).toBeInTheDocument();
    expect(screen.queryByRole("main", { name: /图像编码实验区/ })).not.toBeInTheDocument();
    refused.unmount();

    // The explicit URL escape hatch opens it.
    const override = await renderAppAt("/labs/image-encoding?showExperimentalLabs=1", {
      auth: studentAuthState,
    });
    expect(screen.getByRole("main", { name: /图像编码实验区/ })).toBeInTheDocument();
    override.unmount();

    // A teacher can always open it.
    await renderAppAt("/labs/image-encoding", { auth: teacherAuthState });
    expect(screen.getByRole("main", { name: /图像编码实验区/ })).toBeInTheDocument();
  });

  it("hydrates the photo source through the canonical image query", async () => {
    await renderAppAt("/labs/image-encoding?image=photo&sample=25&bits=8&view=compare");

    expect(screen.getAllByText("小猫插图")).toHaveLength(2);
    expect(screen.queryByLabelText("内置素材")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /原始源图像/ })).toHaveAttribute("width", "240");
    expect(screen.getByRole("img", { name: /原始源图像/ })).toHaveAttribute("height", "160");
  });

  it.each([
    [
      "image lesson",
      "/labs/image-encoding?image=checkerboard&sample=25&bits=2&view=representation",
      /图像编码实验区/,
      /12 × 8 编码采样网格/,
    ],
    [
      "audio lesson",
      "/labs/audio-encoding?source=high-pulse&sampleRate=16000&bitDepth=12",
      /声音编码实验区/,
      /高频脉冲|16.?000|12.?bit/i,
    ],
    [
      "network lesson",
      "/labs/home-network?scenario=wrong-gateway",
      /家庭网络探针实验区/,
      /发送探针|事件链/,
    ],
    [
      "two's-complement lesson",
      "/labs/twos-complement?width=4&a=0111&b=0001&reading=signed",
      /二进制补码实验区/,
      /有符号溢出：有/,
    ],
    [
      "program execution lesson",
      "/labs/program-execution?fixture=zero-iterations",
      /程序执行实验区/,
      /执行一步|程序步骤/,
    ],
    [
      "protocol process lesson",
      "/labs/protocol-process?scenario=request-loss",
      /可靠送达实验区/,
      /执行下一个事件|消息情境/,
    ],
    ["UTF-8 lesson", "/labs/utf8?scenario=emoji", /UTF-8 编码实验区/, /运行到结束|UTF-8 样例/],
    [
      "Monte Carlo lesson",
      "/labs/monte-carlo?scenario=small",
      /蒙特卡洛 π实验区/,
      /运行到结束|蒙特卡洛样例/,
    ],
    [
      "relational data lesson",
      "/labs/relational-data",
      /关系数据实验区/,
      /运行到结束|关系数据情境/,
    ],
    [
      "byte edit lesson",
      "/labs/byte-edit?scenario=accent",
      /字节编辑实验区/,
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
    } else if (_name === "two's-complement lesson") {
      await userEvent.setup().click(screen.getByRole("button", { name: "展开进位与溢出证据" }));
      expect(screen.getByRole("heading", { level: 3, name: expected })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "A，第 3 位，0" })).toBeInTheDocument();
    } else if (_name === "protocol process lesson") {
      expect(screen.getByRole("button", { name: "执行下一个事件" })).toBeInTheDocument();
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
    expect(screen.getByRole("img", { name: /120 × 80 编码采样网格/ })).toBeInTheDocument();
    await navigateApp(router, "/labs/image-encoding?image=gradient&sample=25&bits=2&view=error");
    expect(screen.getByRole("slider", { name: /空间采样/ })).toHaveValue("25");
    expect(screen.getByRole("slider", { name: /颜色位深/ })).toHaveValue("2");
    expect(screen.getByRole("img", { name: /像素颜色差异图/ })).toBeInTheDocument();
  });

  it("changes Sound lesson state when the same route receives a new canonical search", async () => {
    const { router } = await renderAppAt("/labs/audio-encoding?source=pure440");
    expect(document.body).toHaveTextContent("纯 440 Hz 音调");
    await navigateApp(
      router,
      "/labs/audio-encoding?source=sawtooth&sampleRate=16000&bitDepth=12&mode=quantization&view=levels",
    );
    expect(document.body).toHaveTextContent("锯齿波");
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
