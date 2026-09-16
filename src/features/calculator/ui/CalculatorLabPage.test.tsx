import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";
import type { CircuitGraph } from "../domain/graph";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CalculatorLabPage autosave", () => {
  it("saves the edited stage after switching stages before the debounce expires", async () => {
    const saves: Array<{ stageIndex: number; graph: CircuitGraph }> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        saves.push(JSON.parse(String(init.body)) as { stageIndex: number; graph: CircuitGraph });
      }
      const payload =
        init?.method === "PUT"
          ? null
          : { currentStage: 1, passedStages: [], unlockedSubmodules: [], draftGraph: {} };
      return new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await renderAppAt("/classes/c1/labs/calculator");
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: "AND" }));
    fireEvent.click(screen.getByRole("button", { name: /02.*全加器/ }));

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    const stageOneSave = saves.find((save) => save.stageIndex === 1);
    expect(stageOneSave).toBeDefined();
    expect(stageOneSave?.graph.nodes.some((node) => node.kind === "and")).toBe(true);
  });
});
