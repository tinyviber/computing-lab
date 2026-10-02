import { describe, expect, it } from "vitest";
import { encodeQuantScenario, parseQuantScenario, quantScenarioActions } from "./scenario.ts";
import { createQuantLessonState } from "./state.ts";

describe("color-quantization scenario URL codec", () => {
  it("parses a pick-mode scenario", () => {
    expect(parseQuantScenario({ stage: "2", toners: "0,1,5" })).toEqual({
      stageIndex: 2,
      toners: [0, 1, 5],
      table: null,
    });
  });

  it("parses a free-mode scenario", () => {
    const table14 = "1,-1,2,0,1,2,1,0,-1,2,1,0,2,1";
    expect(parseQuantScenario({ stage: "4", table: table14 })).toEqual({
      stageIndex: 4,
      toners: null,
      table: [1, -1, 2, 0, 1, 2, 1, 0, -1, 2, 1, 0, 2, 1],
    });
  });

  it("drops unknown stages and sanitizes toners/table", () => {
    expect(parseQuantScenario({ stage: 99, toners: "100,200" })).toEqual({
      stageIndex: null,
      toners: null,
      table: null,
    });
  });

  it("round-trips a pick scenario", () => {
    const scenario = { stageIndex: 2, toners: [0, 1, 5] };
    expect(parseQuantScenario(encodeQuantScenario(scenario))).toEqual({
      ...scenario,
      table: null,
    });
  });

  it("accepts a single toner the router already parsed as a number", () => {
    expect(parseQuantScenario({ stage: 1, toners: 5 })).toEqual({
      stageIndex: 1,
      toners: [5],
      table: null,
    });
  });

  it("round-trips a single-toner scenario through router search parsing", () => {
    // Mirrors the share link (String(value)) plus TanStack Router's default
    // search parsing, which JSON-parses each value when it can.
    const viaRouter = (search: Record<string, string | number>): Record<string, unknown> =>
      Object.fromEntries(
        Object.entries(search).map(([key, value]) => {
          try {
            return [key, JSON.parse(String(value)) as unknown];
          } catch {
            return [key, String(value)];
          }
        }),
      );
    const search = viaRouter(encodeQuantScenario({ stageIndex: 1, toners: [5] }));
    expect(search).toEqual({ stage: 1, toners: 5 });
    expect(parseQuantScenario(search)).toEqual({ stageIndex: 1, toners: [5], table: null });
  });

  it("round-trips a free scenario", () => {
    const scenario = {
      stageIndex: 4,
      table: [1, -1, 2, 0, 1, 2, 1, 0, -1, 2, 1, 0, 2, 1],
    };
    expect(parseQuantScenario(encodeQuantScenario(scenario))).toEqual({
      stageIndex: 4,
      toners: null,
      table: scenario.table,
    });
  });
});

describe("quantScenarioActions", () => {
  it("applies nothing when stage specified but not unlocked", () => {
    const state = createQuantLessonState(1);
    state.passedStages = [];
    const scenario = parseQuantScenario({ stage: "2", toners: "0,1" });
    expect(quantScenarioActions(state, scenario)).toEqual([]);
  });

  it("selects stage and applies params when stage unlocked", () => {
    const state = createQuantLessonState(1);
    state.passedStages = [1, 2];
    const scenario = parseQuantScenario({ stage: "2", toners: "0,1,5" });
    expect(quantScenarioActions(state, scenario)).toEqual([
      { type: "select-stage", stageIndex: 2 },
      { type: "set-toners", toners: [0, 1, 5] },
    ]);
  });

  it("applies params to current stage when stage not specified", () => {
    const state = createQuantLessonState(3);
    const scenario = parseQuantScenario({ toners: "0,1" });
    expect(quantScenarioActions(state, scenario)).toEqual([{ type: "set-toners", toners: [0, 1] }]);
  });

  it("applies table params for free mode", () => {
    const state = createQuantLessonState(4);
    state.passedStages = [1, 2, 3, 4];
    const table14 = "1,-1,2,0,1,2,1,0,-1,2,1,0,2,1";
    const scenario = parseQuantScenario({ stage: "4", table: table14 });
    expect(quantScenarioActions(state, scenario)).toEqual([
      { type: "select-stage", stageIndex: 4 },
      { type: "set-table", table: [1, -1, 2, 0, 1, 2, 1, 0, -1, 2, 1, 0, 2, 1] },
    ]);
  });
});
