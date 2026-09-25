import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAppAt, teacherAuthState } from "../../../test/router-test-helpers";

describe("IsLabPage", () => {
  it("mounts the workspace: rail, canvas, inspector, and the timeline player", async () => {
    await renderAppAt("/classes/c1/labs/is-sim", { auth: teacherAuthState });

    // The stage rail shows the lab line and the anchored challenge branch.
    expect(await screen.findByRole("heading", { name: /让数据流起来/ })).toBeInTheDocument();
    expect(screen.getByText("支线练习 · 第 5 关后")).toBeInTheDocument();

    // The canvas is prefilled with the stage-1 scaffold (扫码枪 + 书目库)
    // and the palette is gated to the stage's device list.
    expect(screen.getByText("扫码枪")).toBeInTheDocument();
    expect(screen.getByText("书目库")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "＋ 采集点" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "＋ 人工位" })).not.toBeInTheDocument();

    // The player: step/run/reset, case picker, empty timeline — clock idle.
    expect(screen.getByRole("button", { name: "单步" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "连跑" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复位" })).toBeInTheDocument();
    expect(screen.getByLabelText("演示场景")).toBeInTheDocument();

    // Submit and public-test controls render (the lab works offline too).
    expect(screen.getByRole("button", { name: "运行公开测试" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交判定" })).toBeInTheDocument();
  });
});
