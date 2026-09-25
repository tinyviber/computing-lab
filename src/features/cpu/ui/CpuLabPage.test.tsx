import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAppAt, teacherAuthState } from "../../../test/router-test-helpers";

describe("CpuLabPage", () => {
  it("mounts the guided workspace: rail, shelf, prompts, locked editor, machine view", async () => {
    await renderAppAt("/classes/c1/labs/cpu", { auth: teacherAuthState });

    // The stage rail shows the lab line and the anchored challenge groups.
    expect(await screen.findByRole("heading", { name: /按一下时钟/ })).toBeInTheDocument();
    expect(screen.getByText("支线练习 · 第 4 关后")).toBeInTheDocument();
    expect(screen.getByText("支线练习 · 第 5 关后")).toBeInTheDocument();
    expect(screen.getByText("支线练习 · 第 6 关后")).toBeInTheDocument();

    // The instruction shelf is persistent, and the guided checklist asks.
    expect(screen.getByRole("heading", { name: "指令卡片" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "先看懂，再预测" })).toBeInTheDocument();

    // Guided stage 1 locks every row — no selects, just fixed mnemonics.
    const programSection = screen.getByRole("heading", { name: "程序" }).closest("section")!;
    expect(within(programSection).getAllByText("LOAD A, M[14]").length).toBeGreaterThan(0);
    expect(screen.queryByRole("combobox", { name: /第 0 行指令/ })).not.toBeInTheDocument();

    // The machine view: registers, memory grid, diagram, trace — clock idle.
    expect(screen.getByRole("button", { name: "下一拍" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "寄存器" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /存储器/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /数据通路/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "执行轨迹" })).toBeInTheDocument();

    // Submit stays gated until the prompt sequence completes.
    expect(screen.getByRole("button", { name: "运行公开测试" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交判定" })).toBeDisabled();
  });
});
