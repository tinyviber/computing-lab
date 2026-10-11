import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CpuWorkspace } from "../ui/CpuWorkspace.tsx";
import { cpuPreviewFixtures, createCpuPreviewActions } from "./fixtures.ts";

afterEach(() => vi.unstubAllGlobals());

const scene = (id: string) => cpuPreviewFixtures.find((f) => f.id === id)!.model;

describe("CPU fixed presentation scenes", () => {
  it.each(cpuPreviewFixtures)("renders $id with no auth, network or controller", ({ model }) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<CpuWorkspace model={model} actions={createCpuPreviewActions(vi.fn())} />);
    expect(screen.getByRole("main", { name: "CPU 数据通路实验区" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "运行公开测试" }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("records intents while keeping a fixed run deterministic", () => {
    const record = vi.fn();
    render(<CpuWorkspace model={scene("running")} actions={createCpuPreviewActions(record)} />);
    fireEvent.click(screen.getByRole("button", { name: "暂停" }));
    expect(record).toHaveBeenCalledWith("pause");
    expect(screen.getByRole("button", { name: "暂停" })).toBeInTheDocument();
  });

  it("preserves phase synchronization, prompt gates, locks and the full trace", () => {
    const running = scene("running");
    expect(running.machine?.diagram.phase).toBe("decode");
    expect(running.machine?.registers.ir).toBe(running.machine?.diagram.pending?.ir);
    expect(running.editor.disabled).toBe(true);
    const blocked = scene("blocked");
    expect(blocked.machine?.canStep).toBe(false);
    expect(blocked.machine?.blockingNote).toBeTruthy();
    expect(blocked.submission.canSubmit).toBe(false);
    expect(blocked.machine!.trace.run.trace.length).toBeGreaterThan(blocked.machine!.trace.visited);
    expect(scene("initial").editor.editableRows?.size).toBe(0);
    expect(scene("challenge").editor.editableRows).toBeUndefined();
    expect(scene("byte-gated").guide?.prompts.some((p) => p.next && p.byteTarget)).toBe(true);
    const alu = scene("alu-exec").machine!;
    expect(alu.diagram.pending?.decoded.op).toBe("ADD");
    expect(alu.registers.nextCarried).toBe(true);
  });
});
