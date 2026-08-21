import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";

const button = (name: RegExp | string) => screen.getByRole("button", { name });

describe("RelationalDataPage", () => {
  it("renders semantic controls, fixture evidence, and constraint rows", async () => {
    await renderAppAt("/labs/relational-data");

    expect(screen.getByRole("main", { name: "关系数据实验区" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "关系数据" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /行数/ })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /关系数据情境/ })).toHaveValue("catalog");
    expect(screen.getByRole("button", { name: "执行一步" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "运行到结束" })).toBeEnabled();
    expect(screen.queryByRole("region", { name: /关系数据约束/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: /查询结果行/ })).not.toBeInTheDocument();
    expect(screen.getByRole("main")).not.toHaveTextContent(/外键问题/);
    await userEvent.setup().click(button("执行一步"));
    expect(screen.getByRole("table", { name: /约束检查/ })).toHaveTextContent(/失败.*99/);
    const borrowers = screen.getByRole("table", {
      name: /借阅人源行：NULL 与空字符串的对照/,
    });
    expect(within(borrowers).getByText("NULL")).toBeInTheDocument();
    expect(within(borrowers).getByText('""')).toBeInTheDocument();
    expect(screen.getByText(/borrowers\.name 不是 NULL/)).toBeInTheDocument();
  });

  it("supports prediction, query provenance, and the broken loan lesson", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/relational-data");

    const rowCount = screen.getByRole("spinbutton", { name: /行数/ });
    await user.clear(rowCount);
    await user.type(rowCount, "4");
    await user.click(button("记录预测"));
    expect(screen.getByText(/已记录预测：下一条查询将返回 4 行/)).toBeInTheDocument();

    await user.click(button("运行到结束"));
    expect(screen.getByRole("region", { name: /当前关系数据结果/i })).toHaveTextContent(
      /按借阅人统计借阅数/,
    );
    expect(screen.getByRole("region", { name: /当前关系数据结果/i })).toHaveTextContent(
      /计算得到的结果：loans 不是表中直接存储的值/,
    );
    const provenance = screen.getByRole("table", {
      name: /哪些原始记录产生了每条结果/,
    });
    expect(provenance).toHaveTextContent(/loan-1/);
    expect(provenance).toHaveTextContent(/loan-2/);
    expect(provenance).toHaveTextContent(/loan-1, person-1, book-3/);
    expect(provenance).toHaveTextContent(/loan-4, person-3, book-1/);
    expect(screen.getByRole("region", { name: /预测与实际/ })).toHaveTextContent(/全部图书\s*44/);
  });

  it("selects frames with keyboard activation and exposes aria-current", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/relational-data");
    await user.click(button("运行到结束"));

    const first = screen.getByRole("button", { name: /查询 1：全部图书，4 行/ });
    const second = screen.getByRole("button", { name: /查询 2：可借图书，2 行/ });
    first.focus();
    await user.tab();
    expect(second).toHaveFocus();
    first.focus();
    await user.keyboard("{Enter}");
    expect(first).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("region", { name: /当前关系数据结果/i })).toHaveTextContent(
      /The Left Hand of Darkness/,
    );

    second.focus();
    await user.keyboard(" ");
    expect(second).toHaveAttribute("aria-current", "true");
    expect(first).not.toHaveAttribute("aria-current");
  });

  it("keeps semantic evidence available at a narrow viewport", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 520 });
    try {
      await renderAppAt("/labs/relational-data");
      await userEvent.setup().click(button("执行一步"));
      expect(screen.getByRole("table", { name: /查询结果行/ })).toBeVisible();
      expect(screen.getByRole("region", { name: /关系数据约束/ })).toBeVisible();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
  });

  it("uses textual relational evidence instead of legacy panels", async () => {
    await renderAppAt("/labs/relational-data");
    expect(screen.queryByRole("button", { name: /^(submit|check)$/i })).not.toBeInTheDocument();
    for (const selector of [".visualization-panel", ".formula-panel", ".lab-controls"]) {
      expect(document.querySelector(selector)).toBeNull();
    }
    expect(
      within(screen.getByRole("main", { name: /关系数据实验区/ })).getByText(/查询结果与来源行/),
    ).toBeInTheDocument();
  });

  it("keeps the first render exploratory instead of revealing the relational answer", async () => {
    await renderAppAt("/labs/relational-data");

    const firstRender = document.body.textContent ?? "";
    expect(firstRender).not.toMatch(/NULL means absent value; an empty string is present text/i);
    expect(firstRender).not.toMatch(/How does a fixed set of rows answer a query/i);
    expect(firstRender).not.toMatch(/broken loan.*disappears from the joined aggregate/i);
    expect(firstRender).not.toMatch(/NULL 表示缺失值，空字符串仍是存在的文本/);
    expect(screen.queryByRole("region", { name: "关系数据约束" })).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "查询结果行" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "执行一步" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "运行到结束" })).toBeEnabled();
  });
});
