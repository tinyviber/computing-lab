import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";

const button = (name: RegExp | string) => screen.getByRole("button", { name });

describe("Utf8Page", () => {
  it("renders semantic source, controls, output, and selected evidence", async () => {
    await renderAppAt("/labs/utf8");

    expect(screen.getByRole("main", { name: "UTF-8 编码 workspace" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "UTF-8 编码" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /下一个码点分支/ })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /UTF-8 样例/ })).toHaveValue("mixed");
    expect(screen.getByRole("button", { name: "执行一步" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "运行到结束" })).toBeEnabled();
    expect(screen.getByLabelText("编码后的 UTF-8 字节")).toHaveTextContent("—");
  });

  it("supports prediction, mixed transformation, and final byte evidence", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/utf8");

    await user.selectOptions(screen.getByRole("combobox", { name: /下一个码点分支/ }), "1-byte");
    const byteCount = screen.getByRole("spinbutton", { name: /最终字节数/ });
    await user.clear(byteCount);
    await user.type(byteCount, "10");
    await user.click(button("记录预测"));
    expect(screen.getByText(/预测已记录/)).toBeInTheDocument();

    await user.click(button("运行到结束"));
    expect(screen.getByLabelText("编码后的 UTF-8 字节")).toHaveTextContent(
      "65 195 169 231 140 171 240 159 153 130",
    );
    expect(screen.getByRole("region", { name: /最终 UTF-8 结果/ })).toHaveTextContent(
      /4 个可见码点 → 10 个字节/,
    );
    expect(screen.getByRole("region", { name: /选中 UTF-8 证据/ })).toHaveTextContent(
      /U\+1F642.*4 字节/,
    );
  });

  it("selects frames with keyboard activation and exposes aria-current", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/utf8?scenario=mixed");
    await user.click(button("运行到结束"));

    const first = screen.getByRole("button", { name: /第 1 帧.*A.*U\+0041.*1 字节/ });
    const second = screen.getByRole("button", { name: /第 2 帧.*é.*U\+00E9.*2 字节/ });
    first.focus();
    await user.tab();
    expect(second).toHaveFocus();
    first.focus();
    await user.keyboard("{Enter}");
    expect(first).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("region", { name: /选中 UTF-8 证据/ })).toHaveTextContent(/0xxxxxxx/i);

    second.focus();
    await user.keyboard(" ");
    expect(second).toHaveAttribute("aria-current", "true");
    expect(first).not.toHaveAttribute("aria-current");
  });

  it("hydrates fixture boundaries and resets to the original URL scenario", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/utf8?scenario=emoji");
    await user.click(button("运行到结束"));
    expect(screen.getByLabelText("编码后的 UTF-8 字节")).toHaveTextContent("240 159 153 130");

    await user.selectOptions(screen.getByRole("combobox", { name: /UTF-8 样例/ }), "ascii");
    expect(screen.getByText(/点击“执行一步”，检查第一个标量/)).toBeInTheDocument();
    await user.click(button("恢复初始情境"));
    expect(screen.getByRole("combobox", { name: /UTF-8 样例/ })).toHaveValue("emoji");
  });

  it("keeps semantic evidence available at a narrow viewport", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 520 });
    try {
      await renderAppAt("/labs/utf8");
      await userEvent.setup().click(button("执行一步"));
      expect(screen.getByRole("table", { name: /选中码点的字节/ })).toBeVisible();
      expect(screen.getByLabelText("编码后的 UTF-8 字节")).toBeVisible();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
  });

  it("uses textual transformation evidence instead of legacy panels", async () => {
    await renderAppAt("/labs/utf8");
    expect(screen.queryByRole("button", { name: /^(submit|check)$/i })).not.toBeInTheDocument();
    for (const selector of [".visualization-panel", ".formula-panel", ".lab-controls"]) {
      expect(document.querySelector(selector)).toBeNull();
    }
    expect(
      within(screen.getByRole("main", { name: /UTF-8 编码 workspace/i })).getByText(
        /跟踪每个 Unicode 标量/,
      ),
    ).toBeInTheDocument();
  });
});
