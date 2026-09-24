import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAppAt, teacherAuthState } from "../../../test/router-test-helpers";

describe("CpuLabPage", () => {
  it("mounts the workspace: rail, program editor, and the machine view", async () => {
    await renderAppAt("/classes/c1/labs/cpu", { auth: teacherAuthState });

    // The stage rail shows the lab line and the anchored challenge groups.
    expect(await screen.findByRole("heading", { name: /程序会自己走/ })).toBeInTheDocument();
    expect(screen.getByText("支线练习 · 第 4 关后")).toBeInTheDocument();
    expect(screen.getByText("支线练习 · 第 5 关后")).toBeInTheDocument();

    // The editor is prefilled with the stage-1 scaffold row.
    expect(screen.getByRole("heading", { name: "程序" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("LOAD")).toBeInTheDocument();

    // The machine view: registers, memory grid, diagram, trace — clock idle.
    expect(screen.getByRole("button", { name: "单步" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "寄存器" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /存储器/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /数据通路/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "执行轨迹" })).toBeInTheDocument();

    // Submit and public-test controls render (network fails offline → the
    // load error line may appear; the lab itself still works).
    expect(screen.getByRole("button", { name: "运行公开测试" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交判定" })).toBeInTheDocument();
  });
});
