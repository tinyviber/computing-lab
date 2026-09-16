import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentDef } from "../domain/graph";
import { StageRail } from "./StageRail";

afterEach(() => vi.unstubAllGlobals());

describe("StageRail custom components", () => {
  it("confirms and delegates deletion of a custom component", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const onEdit = vi.fn();
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    const custom: ComponentDef = {
      name: "PartialProduct",
      custom: true,
      graph: { nodes: [], edges: [] },
    };

    render(
      <StageRail
        onDeleteCustomComponent={onDelete}
        onEditCustomComponent={onEdit}
        onPlaceComponent={vi.fn()}
        onSelectStage={vi.fn()}
        passedStages={[]}
        stageIndex={1}
        unlockedSubmodules={[custom]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "删除自定义组件 PartialProduct" }));
    expect(window.confirm).toHaveBeenCalledWith("确定删除自定义组件“PartialProduct”吗？");
    expect(onDelete).toHaveBeenCalledWith("PartialProduct");

    await user.click(screen.getByRole("button", { name: "编辑自定义组件 PartialProduct" }));
    expect(onEdit).toHaveBeenCalledWith("PartialProduct");
  });
});
