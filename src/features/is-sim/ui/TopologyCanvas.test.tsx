import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getIsStage } from "../domain/stages.ts";
import { TopologyCanvas } from "./TopologyCanvas.tsx";

const stage = getIsStage(1)!;

function renderCanvas(flaggedIds?: ReadonlySet<string>) {
  render(
    <TopologyCanvas
      disabled={false}
      flaggedIds={flaggedIds}
      onAddLink={vi.fn()}
      onAddNode={vi.fn()}
      onRemoveLink={vi.fn()}
      onSelect={vi.fn()}
      selectedId={null}
      stage={stage}
      topology={stage.prefill}
      views={null}
    />,
  );
}

describe("TopologyCanvas counterexample marks", () => {
  it("outlines, icons and announces only the devices a failed judgement names", () => {
    renderCanvas(new Set(["books"]));

    const books = screen.getByRole("button", { name: "数据库 书目库，判定反例涉及此设备" });
    expect(books).toHaveClass("is-flagged");
    expect(books).toHaveAttribute("title", "判定反例涉及此设备");
    expect(books.querySelector(".is-node-flag")).not.toBeNull();

    const scan = screen.getByRole("button", { name: "采集点 扫码枪" });
    expect(scan).not.toHaveClass("is-flagged");
    expect(scan).not.toHaveAttribute("title");
    expect(scan.querySelector(".is-node-flag")).toBeNull();
  });

  it("marks nothing when no ids are flagged", () => {
    renderCanvas();
    expect(screen.getByRole("button", { name: "数据库 书目库" })).not.toHaveClass("is-flagged");
    expect(screen.queryByRole("button", { name: /判定反例涉及此设备/ })).not.toBeInTheDocument();
  });
});
