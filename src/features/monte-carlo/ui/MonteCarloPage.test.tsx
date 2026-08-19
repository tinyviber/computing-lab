import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";

const button = (name: RegExp | string) => screen.getByRole("button", { name });

describe("MonteCarloPage", () => {
  it("renders semantic controls, fixture evidence, and comparison rows", async () => {
    await renderAppAt("/labs/monte-carlo");

    expect(screen.getByRole("main", { name: "蒙特卡洛 π workspace" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "蒙特卡洛 π" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /最终估计值相对 π 的位置/ })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /蒙特卡洛样例/ })).toHaveValue("medium");
    expect(screen.getByRole("button", { name: "执行一步" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "运行到结束" })).toBeEnabled();
    expect(screen.getByRole("table", { name: "样例比较" })).toHaveTextContent(/3\.1448.*3\.1328/i);
  });

  it("supports prediction, convergence evidence, and the final estimate", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/monte-carlo?scenario=small");

    await user.selectOptions(
      screen.getByRole("combobox", { name: /最终估计值相对 π 的位置/ }),
      "below",
    );
    await user.click(button("记录预测"));
    expect(screen.getByText(/预测已记录/)).toBeInTheDocument();

    await user.click(button("运行到结束"));
    expect(screen.getByLabelText("最终蒙特卡洛估计值")).toHaveTextContent("3.08");
    expect(screen.getByRole("region", { name: /最终蒙特卡洛结果/ })).toHaveTextContent(
      /最终误差为 0\.0616/,
    );
    expect(screen.getByRole("region", { name: /选中蒙特卡洛证据/ })).toHaveTextContent(
      /第 4 批.*1000 个样本/,
    );
    const geometry = screen.getByRole("region", { name: /蒙特卡洛几何证据/ });
    expect(geometry).toHaveTextContent(/当前显示本批 250 个点中的 128 个/);
    expect(geometry).toHaveTextContent(/整批：圆内 198 个、圆外 52 个/);
    expect(geometry).toHaveTextContent(/圆内 \/ 总数.*π \/ 4/);
    expect(geometry.querySelectorAll("[data-monte-carlo-point]")).toHaveLength(128);
    expect(geometry.querySelector("[data-monte-carlo-boundary]")).toBeInTheDocument();
    expect(geometry.querySelectorAll("[data-monte-carlo-axis]")).toHaveLength(2);
    expect(geometry.querySelectorAll('[data-monte-carlo-point="inside"]').length).toBeGreaterThan(
      0,
    );
    expect(geometry.querySelectorAll('[data-monte-carlo-point="outside"]').length).toBeGreaterThan(
      0,
    );
    expect(screen.getByRole("region", { name: /按批次收敛表/ })).toHaveTextContent(
      /2\.944.*3\.0507/i,
    );
  });

  it("selects frames with keyboard activation and exposes aria-current", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/monte-carlo?scenario=small");
    await user.click(button("运行到结束"));

    const first = screen.getByRole("button", { name: /第 1 批，250 个样本，184 个在圆内/ });
    const second = screen.getByRole("button", { name: /第 2 批，500 个样本，375 个在圆内/ });
    first.focus();
    await user.tab();
    expect(second).toHaveFocus();
    first.focus();
    await user.keyboard("{Enter}");
    expect(first).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("region", { name: /选中蒙特卡洛证据/ })).toHaveTextContent(/2\.944/);

    second.focus();
    await user.keyboard(" ");
    expect(second).toHaveAttribute("aria-current", "true");
    expect(first).not.toHaveAttribute("aria-current");
  });

  it("hydrates fixtures and resets to the original URL scenario", async () => {
    const user = userEvent.setup();
    await renderAppAt("/labs/monte-carlo?scenario=large");
    expect(screen.getByRole("combobox", { name: /蒙特卡洛样例/ })).toHaveValue("large");

    await user.selectOptions(screen.getByRole("combobox", { name: /蒙特卡洛样例/ }), "small");
    expect(screen.getByText(/点击“执行一步”，生成前 250 个随机点/)).toBeInTheDocument();
    await user.click(button("恢复初始情境"));
    expect(screen.getByRole("combobox", { name: /蒙特卡洛样例/ })).toHaveValue("large");
  });

  it("keeps semantic evidence available at a narrow viewport", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 520 });
    try {
      await renderAppAt("/labs/monte-carlo?scenario=small");
      await userEvent.setup().click(button("执行一步"));
      expect(screen.getByRole("table", { name: /按批次观察收敛/ })).toBeVisible();
      expect(screen.queryByLabelText("最终蒙特卡洛估计值")).not.toBeInTheDocument();
      expect(screen.getByRole("region", { name: /选中蒙特卡洛证据/ })).toBeVisible();
      expect(screen.getByRole("region", { name: /蒙特卡洛几何证据/ })).toBeVisible();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
  });

  it("uses textual convergence evidence instead of legacy panels", async () => {
    await renderAppAt("/labs/monte-carlo");
    expect(screen.queryByRole("button", { name: /^(submit|check)$/i })).not.toBeInTheDocument();
    for (const selector of [".visualization-panel", ".formula-panel", ".lab-controls"]) {
      expect(document.querySelector(selector)).toBeNull();
    }
    expect(
      within(screen.getByRole("main", { name: /蒙特卡洛 π workspace/ })).getByText(
        /需要多少个随机点才能估计 π/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Math\.random/i)).not.toBeInTheDocument();
  });
});
