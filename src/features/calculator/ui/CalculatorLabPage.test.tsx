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
    await screen.findByRole("button", { name: /02.*半加器/ });
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: /02.*半加器/ }));
    fireEvent.click(screen.getByRole("button", { name: "AND" }));
    fireEvent.click(screen.getByRole("button", { name: /03.*全加器/ }));

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    const stageTwoSave = saves.find((save) => save.stageIndex === 2);
    expect(stageTwoSave).toBeDefined();
    expect(stageTwoSave?.graph.nodes.some((node) => node.kind === "and")).toBe(true);
  });
});

describe("CalculatorLabPage coach", () => {
  it("opens with the signal lesson and pre-places an XOR for the first wire", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              currentStage: 2,
              passedStages: [1],
              unlockedSubmodules: [],
              draftGraph: {},
            }),
            { headers: { "content-type": "application/json" } },
          ),
        ),
      ),
    );

    await renderAppAt("/classes/c1/labs/calculator");

    // The tour continues on stage 2 after the first-wire stage is passed.
    fireEvent.click(await screen.findByRole("button", { name: /02.*半加器/ }));
    expect(await screen.findByText("先认识信号")).toBeInTheDocument();

    // Toggling A advances the tour to the "what 0/1 means" beat.
    fireEvent.click(screen.getByRole("button", { name: "切换 A，当前 0" }));
    expect(await screen.findByText("0 和 1")).toBeInTheDocument();

    // Past the ports beat the tour asks for the first wire — and the XOR the
    // learner needs is already on the canvas.
    fireEvent.click(screen.getByRole("button", { name: "继续" }));
    fireEvent.click(await screen.findByRole("button", { name: "继续" }));
    expect(await screen.findByText("第一根导线")).toBeInTheDocument();
    expect(await screen.findByText("XOR", { selector: ".node-label" })).toBeInTheDocument();
  });
});
