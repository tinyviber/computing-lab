import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentDef } from "../domain/graph";
import { CustomComponentDialog } from "./CustomComponentDialog";

describe("CustomComponentDialog editing", () => {
  it("saves a reordered port list for an existing component", () => {
    const onUpdate = vi.fn();
    const component: ComponentDef = {
      name: "LogicPair",
      custom: true,
      graph: {
        nodes: [
          { id: "a", kind: "input", name: "A", x: 40, y: 40 },
          { id: "b", kind: "input", name: "B", x: 40, y: 86 },
          { id: "gate", kind: "xor", x: 200, y: 40 },
          { id: "sum", kind: "output", name: "Sum", x: 420, y: 40 },
        ],
        edges: [
          { id: "a-gate", from: { node: "a", port: "out" }, to: { node: "gate", port: "in0" } },
          { id: "b-gate", from: { node: "b", port: "out" }, to: { node: "gate", port: "in1" } },
          { id: "gate-sum", from: { node: "gate", port: "out" }, to: { node: "sum", port: "in" } },
        ],
      },
    };
    render(<CustomComponentDialog component={component} onCancel={vi.fn()} onUpdate={onUpdate} />);

    const dataTransfer = { effectAllowed: "", setData: vi.fn() };
    const firstRow = screen.getByLabelText("拖动入口 1").parentElement;
    expect(firstRow).not.toBeNull();
    fireEvent.dragStart(screen.getByLabelText("拖动入口 2"), { dataTransfer });
    fireEvent.drop(firstRow, { dataTransfer });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    expect(onUpdate).toHaveBeenCalledWith({
      name: "LogicPair",
      inputNames: ["B", "A"],
      outputNames: ["Sum"],
      inputPortKeys: ["b", "a"],
      outputPortKeys: ["sum"],
    });
  });
});
