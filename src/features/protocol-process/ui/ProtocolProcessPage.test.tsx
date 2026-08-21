import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";

const button = (name: RegExp | string) => screen.getByRole("button", { name });

describe("ProtocolProcessPage", () => {
  it("renders semantic controls, queue evidence, and disabled guided actions", async () => {
    await renderAppAt("/labs/protocol-process");

    expect(screen.getByRole("main", { name: "可靠送达实验区" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "可靠送达" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /你的预测/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /消息情境/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "执行一步" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "运行到结束" })).toBeEnabled();
    expect(button("检查第一个故障")).toBeDisabled();
    expect(button("检查重试")).toBeDisabled();
    expect(button("检查第一个故障")).not.toHaveAccessibleDescription();
    await userEvent.setup().click(button("执行一步"));
    expect(screen.getByRole("table", { name: /选中事件后的协议计数/i })).toBeInTheDocument();
  });

  it("supports prediction, fault inspection, retry inspection, and final delivery evidence", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/protocol-process");

    await user.selectOptions(screen.getByRole("combobox", { name: /你的预测/i }), "delivered");
    await user.selectOptions(screen.getByRole("combobox", { name: /请求次数/i }), "2");
    await user.selectOptions(
      screen.getByRole("combobox", { name: /超时发生时，发送方能确定什么/i }),
      "status-unknown",
    );
    await user.click(button("记录预测"));
    expect(screen.getByText(/预测已记录；事件记录仍可继续检查/)).toBeInTheDocument();

    await user.click(button("运行到结束"));
    expect(button("检查第一个故障")).toBeEnabled();
    expect(button("检查重试")).toBeEnabled();

    await user.click(button("检查第一个故障"));
    const evidence = screen.getByRole("region", { name: /选中事件结果/i });
    expect(evidence).toHaveTextContent(/时刻 5/);
    expect(evidence).toHaveTextContent(/已丢失/);
    expect(evidence).toHaveTextContent(/确认在发送方观察到之前丢失/);

    await user.click(button("检查重试"));
    expect(screen.getByRole("region", { name: /选中事件结果/i })).toHaveTextContent(
      /第 2 次请求重试/,
    );
    expect(screen.getByRole("region", { name: /最终协议结果/i })).toHaveTextContent(
      /状态：已送达.*尝试次数：2.*接受次数：1.*重复抑制：1/,
    );
    expect(screen.getByRole("region", { name: /最终协议结果/i })).toHaveTextContent(
      /预测：会送达.*预计 2 次.*实际结果：\s*已送达.*超时判断：状态未知/i,
    );
  });

  it("selects event frames with keyboard activation and exposes aria-current", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/protocol-process?scenario=no-loss");
    await user.click(button("运行到结束"));

    const first = screen.getByRole("button", { name: /第 1 步，时刻 0，发送请求/i });
    const second = screen.getByRole("button", { name: /第 2 步，时刻 2，送达请求/i });
    first.focus();
    await user.tab();
    expect(second).toHaveFocus();
    first.focus();
    await user.keyboard("{Enter}");
    expect(first).toHaveAttribute("aria-current", "true");

    const final = screen.getByRole("button", { name: /第 4 步，时刻 5，送达确认/i });
    final.focus();
    await user.keyboard(" ");
    expect(final).toHaveAttribute("aria-current", "true");
    expect(first).not.toHaveAttribute("aria-current");
  });

  it("switches scenarios and resets to the original URL scenario", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/protocol-process?scenario=request-loss");
    await user.click(button("运行到结束"));
    expect(screen.getByRole("region", { name: /最终协议结果/i })).toHaveTextContent(
      /尝试次数：2.*重复抑制：0/,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: /消息情境/i }), "no-loss");
    expect(screen.getByText(/点击“执行一步”，处理第一个请求事件/)).toBeInTheDocument();
    await user.click(button("恢复初始情境"));
    expect(screen.getByRole("combobox", { name: /消息情境/i })).toHaveValue("request-loss");
  });

  it("keeps semantic evidence available at a narrow viewport", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 520 });
    try {
      await renderAppAt("/labs/protocol-process");
      expect(screen.getByRole("button", { name: "执行一步" })).toBeVisible();
      await userEvent.setup().click(button("执行一步"));
      expect(screen.getByRole("table", { name: /选中事件后的协议计数/i })).toBeVisible();
      expect(screen.getByRole("region", { name: /最终协议结果/i })).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
  });

  it("uses textual protocol evidence instead of a legacy workflow or shared panels", async () => {
    await renderAppAt("/labs/protocol-process");

    expect(screen.queryByRole("button", { name: /^(submit|check)$/i })).not.toBeInTheDocument();
    expect(screen.queryAllByText(/^(ready|editing|success|failure)$/i)).toHaveLength(0);
    for (const selector of [".visualization-panel", ".formula-panel", ".lab-controls"]) {
      expect(document.querySelector(selector)).toBeNull();
    }
    expect(
      within(screen.getByRole("main", { name: /可靠送达实验区/ })).getByText(
        /时钟是模拟的，\s*每次队列变化都可以检查/,
      ),
    ).toBeInTheDocument();
  });

  it("keeps the first render exploratory instead of revealing the protocol answer", async () => {
    await renderAppAt("/labs/protocol-process");

    const firstRender = document.body.textContent ?? "";
    expect(firstRender).not.toMatch(/A timeout alone does not prove receiver failure/i);
    expect(firstRender).not.toMatch(/Receiver accepts once, then suppresses the retry duplicate/i);
    expect(firstRender).not.toMatch(/超时本身不等于接收方失败/);
    expect(firstRender).not.toMatch(/接收方已经接受过.*重复请求没有再次生效/);
    expect(screen.getByRole("button", { name: "执行一步" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "检查第一个故障" })).toBeDisabled();
    expect(screen.queryByRole("region", { name: "情境比较" })).not.toBeInTheDocument();
  });
});
