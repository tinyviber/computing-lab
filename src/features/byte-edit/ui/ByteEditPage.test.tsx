import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";

const button = (name: RegExp | string) => screen.getByRole("button", { name });

describe("ByteEditPage", () => {
  it("renders semantic controls, fixture bytes, and a valid current decode", async () => {
    await renderAppAt("/labs/byte-edit");

    expect(screen.getByRole("main", { name: "字节编辑实验区" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "字节编辑" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /有效性/ })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /字节索引/ })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /字节编辑样例/ })).toHaveValue("mixed");
    expect(screen.getByRole("button", { name: "应用编辑" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /当前字节序列/ })).toHaveTextContent(
      /有效 UTF-8 → “Aé猫🙂”/,
    );
  });

  it("supports prediction, a corrupting byte edit, and exact rule evidence", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/byte-edit");

    await user.selectOptions(screen.getByRole("combobox", { name: /有效性/ }), "invalid");
    await user.click(button("记录预测"));
    expect(screen.getByText(/预测已记录/)).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: /字节索引/ }), "2");
    const value = screen.getByRole("spinbutton", { name: /新值/ });
    await user.clear(value);
    await user.type(value, "65");
    await user.click(button("应用编辑"));

    expect(screen.getByRole("region", { name: /选中字节编辑结果/ })).toHaveTextContent(
      /第 2 个字节 → 65/,
    );
    expect(screen.getByRole("region", { name: /选中字节编辑结果/ })).toHaveTextContent(
      /第 2 个字节被拒绝.*无效延续字节.*问题字节 0x41/,
    );
    expect(screen.getByRole("region", { name: /选中字节编辑结果/ })).toHaveTextContent(
      /预测：无效；实际：无效/,
    );
  });

  it("selects frames with keyboard activation and exposes aria-current", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/byte-edit");
    await user.click(button(/截断/));
    await user.click(button(/原始/));

    const first = screen.getByRole("button", { name: /第 1 次编辑.*截断.*无效/ });
    const second = screen.getByRole("button", { name: /第 2 次编辑.*原始.*有效/ });
    first.focus();
    await user.tab();
    expect(second).toHaveFocus();
    first.focus();
    await user.keyboard("{Enter}");
    expect(first).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("region", { name: /选中字节编辑结果/ })).toHaveTextContent(
      /缺少后续字节/,
    );

    second.focus();
    await user.keyboard(" ");
    expect(second).toHaveAttribute("aria-current", "true");
    expect(first).not.toHaveAttribute("aria-current");
  });

  it("loads presets and resets to the original URL scenario", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/byte-edit?scenario=emoji");
    expect(screen.getByRole("combobox", { name: /字节编辑样例/ })).toHaveValue("emoji");

    await user.click(button("过长编码 A"));
    expect(screen.getByRole("region", { name: /当前字节序列/ })).toHaveTextContent(/过长编码/);
    await user.click(button("恢复初始情境"));
    expect(screen.getByRole("combobox", { name: /字节编辑样例/ })).toHaveValue("emoji");
    expect(screen.getByRole("region", { name: /当前字节序列/ })).toHaveTextContent(/有效 UTF-8/);
  });

  it("keeps semantic evidence available at a narrow viewport", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 520 });
    try {
      await renderAppAt("/labs/byte-edit");
      await userEvent.setup().click(button("代理项"));
      expect(screen.getByRole("region", { name: /选中字节编辑结果/ })).toBeVisible();
      expect(screen.getByRole("region", { name: /当前字节序列/ })).toHaveTextContent(/代理码点/);
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
  });

  it("uses textual rule evidence instead of legacy panels", async () => {
    await renderAppAt("/labs/byte-edit");
    expect(screen.queryByRole("button", { name: /^(submit|check)$/i })).not.toBeInTheDocument();
    for (const selector of [".visualization-panel", ".formula-panel", ".lab-controls"]) {
      expect(document.querySelector(selector)).toBeNull();
    }
    expect(
      within(screen.getByRole("main", { name: /字节编辑实验区/ })).getByText(/编辑 UTF-8 字节/),
    ).toBeInTheDocument();
  });
});
