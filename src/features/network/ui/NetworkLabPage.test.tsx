import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAppAt, teacherAuthState } from "../../../test/router-test-helpers";

describe("NetworkLabPage", () => {
  it("mounts the workspace: rail, canvas, inspector, and the trace player", async () => {
    await renderAppAt("/classes/c1/labs/network", { auth: teacherAuthState });

    // The stage rail shows the lab line and the anchored challenge branch.
    expect(await screen.findByRole("heading", { name: /同一网段才直接投递/ })).toBeInTheDocument();
    expect(screen.getByText("支线练习 · 第 4 关后")).toBeInTheDocument();

    // Stage-1 canvas is prefilled with the two hosts and their link.
    // (Each node renders label + id, so expect more than one hit.)
    expect(screen.getAllByText("PC1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("PC2").length).toBeGreaterThan(0);

    // The player: step/run/reset, case picker, step counter — clock idle.
    expect(screen.getByRole("button", { name: "单步" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "连跑" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复位" })).toBeInTheDocument();
    expect(screen.getByText("演示探针")).toBeInTheDocument();

    // Submit and public-test controls render (the lab works offline too).
    expect(screen.getByRole("button", { name: "运行公开测试" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交判定" })).toBeInTheDocument();
  });
});
