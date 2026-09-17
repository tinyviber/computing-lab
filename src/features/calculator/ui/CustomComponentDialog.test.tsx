import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentDef } from "../domain/graph";
import { CustomComponentDialog } from "./CustomComponentDialog";

const logicPair: ComponentDef = {
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

describe("CustomComponentDialog editing", () => {
  it("saves a reordered port list for an existing component", () => {
    const onUpdate = vi.fn();
    render(<CustomComponentDialog component={logicPair} onCancel={vi.fn()} onUpdate={onUpdate} />);

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

  it("shows a drop-position line while dragging over a row", () => {
    render(<CustomComponentDialog component={logicPair} onCancel={vi.fn()} onUpdate={vi.fn()} />);

    const dataTransfer = { effectAllowed: "", setData: vi.fn() };
    const firstRow = screen.getByLabelText("拖动入口 1").parentElement as HTMLElement;
    const secondRow = screen.getByLabelText("拖动入口 2").parentElement as HTMLElement;
    fireEvent.dragStart(screen.getByLabelText("拖动入口 1"), { dataTransfer });
    // jsdom reports zero-size rects; a clientY above the rows resolves to
    // "before the first row", below resolves to "after the last row".
    fireEvent(secondRow, new MouseEvent("dragover", { bubbles: true, clientY: -10 }));
    expect(firstRow.className).toContain("drop-before");
    fireEvent(firstRow, new MouseEvent("dragover", { bubbles: true, clientY: 10 }));
    expect(secondRow.className).toContain("drop-after");
    expect(firstRow.className).not.toContain("drop-before");
  });

  it("lets the component be renamed while editing", () => {
    const onUpdate = vi.fn();
    render(
      <CustomComponentDialog
        component={logicPair}
        existingNames={["LogicPair", "Add4"]}
        onCancel={vi.fn()}
        onUpdate={onUpdate}
      />,
    );

    const nameField = screen.getByLabelText("组件名称");
    expect(nameField).not.toBeDisabled();
    fireEvent.change(nameField, { target: { value: "PairBlock" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: "PairBlock" }));
  });

  it("rejects a name already used by another component", () => {
    const onUpdate = vi.fn();
    render(
      <CustomComponentDialog
        component={logicPair}
        existingNames={["LogicPair", "Add4"]}
        onCancel={vi.fn()}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.change(screen.getByLabelText("组件名称"), { target: { value: "Add4" } });
    expect(screen.getByRole("button", { name: "保存修改" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
