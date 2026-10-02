import { describe, expect, it } from "vitest";
import {
  encodeSamplingScenario,
  parseSamplingScenario,
  samplingScenarioActions,
} from "./scenario.ts";
import { createSamplingLessonState } from "./state.ts";

describe("scenario URL codec", () => {
  it("parses a full scenario", () => {
    expect(parseSamplingScenario({ stage: "4", w: "16", h: "8" })).toEqual({
      stageIndex: 4,
      width: 16,
      height: 8,
    });
  });

  it("drops unknown stages and clamps resolutions", () => {
    expect(parseSamplingScenario({ stage: 99, w: 500, h: 1 })).toEqual({
      stageIndex: null,
      width: 64,
      height: 2,
    });
  });

  it("a lone w implies square", () => {
    expect(parseSamplingScenario({ w: 12 })).toEqual({
      stageIndex: null,
      width: 12,
      height: 12,
    });
  });

  it("round-trips", () => {
    const scenario = { stageIndex: 2, width: 24, height: 24 };
    expect(parseSamplingScenario(encodeSamplingScenario(scenario))).toEqual(scenario);
  });
});

describe("samplingScenarioActions", () => {
  it("applies nothing when stage specified but not unlocked", () => {
    const state = createSamplingLessonState(1);
    state.passedStages = [];
    const scenario = parseSamplingScenario({ stage: "2", w: "16", h: "8" });
    expect(samplingScenarioActions(state, scenario)).toEqual([]);
  });

  it("selects stage and applies resolution when stage unlocked", () => {
    const state = createSamplingLessonState(1);
    state.passedStages = [1, 2, 3];
    const scenario = parseSamplingScenario({ stage: "3", w: "16", h: "8" });
    expect(samplingScenarioActions(state, scenario)).toEqual([
      { type: "select-stage", stageIndex: 3 },
      { type: "set-resolution", width: 16, height: 8 },
    ]);
  });

  it("applies resolution to current stage when stage not specified", () => {
    const state = createSamplingLessonState(3);
    const scenario = parseSamplingScenario({ w: "12" });
    expect(samplingScenarioActions(state, scenario)).toEqual([
      { type: "set-resolution", width: 12, height: 12 },
    ]);
  });

  it("does not apply resolution to requiresChooseSize stages", () => {
    const state = createSamplingLessonState(1);
    state.passedStages = [1, 2];
    // Stage 2 is requiresChooseSize
    const scenario = parseSamplingScenario({ stage: "2", w: "16", h: "8" });
    expect(samplingScenarioActions(state, scenario)).toEqual([
      { type: "select-stage", stageIndex: 2 },
      // No set-resolution action
    ]);
  });
});
