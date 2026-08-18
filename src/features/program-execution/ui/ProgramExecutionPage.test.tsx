import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";

const button = (name: RegExp | string) => screen.getByRole("button", { name });

describe("ProgramExecutionPage", () => {
  it("renders semantic source, controls, variable evidence, and labeled output", async () => {
    await renderAppAt("/labs/program-execution");

    expect(screen.getByRole("main", { name: "程序执行 workspace" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "程序执行" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "程序步骤" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /初始变量/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "执行一步" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "运行到结束" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "检查变量变化" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "检查循环停止" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "检查变量变化" })).toHaveAccessibleDescription(
      /对应执行步骤出现后/,
    );
    expect(screen.getByRole("status", { name: /程序输出/i })).toHaveTextContent("—");
  });

  it("supports the prediction → variable-change → loop-stop → output trajectory", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/program-execution");

    await user.type(screen.getByRole("spinbutton", { name: /预测输出值/ }), "6");
    await user.click(button("记录预测"));
    expect(screen.getByText(/预测已记录/)).toBeInTheDocument();

    for (let index = 0; index < 5; index += 1) await user.click(button("执行一步"));
    expect(button("检查变量变化")).toBeEnabled();
    await user.click(button("检查变量变化"));

    const evidence = screen.getByRole("region", { name: /选中步骤证据/ });
    expect(evidence).toHaveTextContent(/total:\s*0\s*→\s*1/);
    expect(screen.getByRole("button", { name: /第 5 步.*第 5 行.*赋值/ })).toBeInTheDocument();

    await user.click(button("运行到结束"));
    expect(button("检查循环停止")).toBeEnabled();
    await user.click(button("检查循环停止"));
    expect(screen.getByRole("region", { name: /选中步骤证据/ })).toHaveTextContent(/4 <= 3 → 假/);
    expect(screen.getByRole("region", { name: /选中步骤证据/ })).toHaveTextContent(
      /这次检查跳过循环体/,
    );
    expect(screen.getByRole("status", { name: /程序输出/i })).toHaveTextContent("6");
    expect(screen.getByText(/预测：6；观察值：6/)).toBeInTheDocument();
    expect(screen.getByText(/程序已完成/)).toBeInTheDocument();
  });

  it("selects trace frames with keyboard activation and exposes aria-current", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/program-execution");
    await user.click(button("运行到结束"));

    const firstFrame = screen.getByRole("button", { name: /第 1 步.*第 1 行.*赋值/ });
    const secondFrame = screen.getByRole("button", { name: /第 2 步.*第 2 行.*赋值/ });
    firstFrame.focus();
    await user.tab();
    expect(secondFrame).toHaveFocus();
    firstFrame.focus();
    await user.keyboard("{Enter}");
    expect(firstFrame).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("region", { name: /选中步骤证据/ })).toHaveTextContent(/total\s*—\s*0/);

    const finalFrame = screen.getByRole("button", { name: /第 13 步.*第 7 行.*输出/ });
    finalFrame.focus();
    await user.keyboard(" ");
    expect(finalFrame).toHaveAttribute("aria-current", "true");
    expect(firstFrame).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("region", { name: /选中步骤证据/ })).toHaveTextContent(/产生 6/);
  });

  it("shows zero-iteration evidence and clears transient state on fixture switch/reset", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/program-execution?fixture=off-by-one");
    await user.click(button("运行到结束"));
    expect(screen.getByRole("status", { name: /程序输出/i })).toHaveTextContent("3");
    await user.click(button("检查循环停止"));
    expect(screen.getByRole("region", { name: /选中步骤证据/ })).toHaveTextContent(/3 < 3 → 假/);

    await user.click(button(/^零次循环/));
    expect(screen.getByText(/点击“执行一步”，创建第一个执行步骤/)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /程序输出/i })).toHaveTextContent("—");
    expect(button("检查变量变化")).toBeDisabled();

    await user.click(button("运行到结束"));
    await user.click(button("检查循环停止"));
    expect(screen.getByRole("region", { name: /选中步骤证据/ })).toHaveTextContent(/4 <= 3 → 假/);
    expect(screen.getByRole("status", { name: /程序输出/i })).toHaveTextContent("10");

    await user.click(button("恢复初始情境"));
    expect(screen.getByRole("button", { name: /边界比较/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText(/点击“执行一步”，创建第一个执行步骤/)).toBeInTheDocument();
  });

  it("keeps semantic evidence available at a narrow viewport", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 520 });
    try {
      await renderAppAt("/labs/program-execution");
      expect(screen.getByRole("list", { name: "程序步骤" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "执行一步" })).toBeVisible();
      expect(screen.getByRole("button", { name: "运行到结束" })).toBeVisible();
      expect(screen.getByRole("table", { name: /初始变量/i })).toBeVisible();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
  });

  it("keeps the first render exploratory and uses learner-facing step language", async () => {
    await renderAppAt("/labs/program-execution");

    const main = screen.getByRole("main", { name: "程序执行 workspace" });
    expect(main).toHaveTextContent(/看看程序每一步发生了什么/);
    expect(main).not.toHaveTextContent(/不可变本地记录|因果事件|本地纯转换|第 .*帧/);
    expect(screen.getByRole("region", { name: /选中步骤证据/ })).toHaveTextContent(
      /执行一步，检查执行前后的状态/,
    );
  });

  it("uses text evidence instead of a legacy workflow or shared lesson panels", async () => {
    await renderAppAt("/labs/program-execution");

    expect(
      screen.queryByRole("button", { name: /^(submit|check configuration|check)$/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByText(/^(ready|editing|success|failure)$/i)).toHaveLength(0);
    for (const selector of [".visualization-panel", ".formula-panel", ".lab-controls"]) {
      expect(document.querySelector(selector)).toBeNull();
    }
    expect(
      within(screen.getByRole("main", { name: /程序执行 workspace/i })).getByText(
        /每一步只执行一条/i,
      ),
    ).toBeInTheDocument();
  });
});
