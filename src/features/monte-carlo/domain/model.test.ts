import { describe, expect, it } from "vitest";
import {
  createMonteCarloMachine,
  getMonteCarloScenario,
  monteCarloComparison,
  nextSample,
  runMonteCarlo,
  stepMonteCarlo,
  MONTE_CARLO_SCENARIOS,
} from "./index";

const CLOSE = 1e-9;

describe("Monte Carlo domain", () => {
  it("hand-authors the first sample stream for seed 42", () => {
    const first = nextSample(42);
    const second = nextSample(first.state);
    const third = nextSample(second.state);

    expect(first).toEqual({
      state: -1031181384,
      x: 0.7911529541015625,
      y: 0.7599029541015625,
    });
    expect(second).toEqual({
      state: -478808842,
      x: 0.7329864501953125,
      y: 0.8885040283203125,
    });
    expect(third.state).toBe(-2075817116);
    expect(third.x).toBe(0.71142578125);
    expect(third.y).toBe(0.5166778564453125);
  });

  it("matches hand-authored batch evidence for the small fixture", () => {
    const scenario = getMonteCarloScenario("small");
    const result = runMonteCarlo(scenario);

    expect(result.frames).toHaveLength(4);
    expect(result.frames.map((frame) => frame.batch)).toEqual([1, 2, 3, 4]);
    expect(result.frames.map((frame) => frame.sampleCount)).toEqual([250, 500, 750, 1000]);
    expect(result.frames.map((frame) => frame.insideCount)).toEqual([184, 375, 572, 770]);
    expect(result.frames.map((frame) => frame.estimate)).toEqual([
      2.944, 3, 3.050666666666667, 3.08,
    ]);
    expect(result.frames.map((frame) => frame.error)).toEqual([
      0.19759265358979317, 0.14159265358979312, 0.09092598692312626, 0.061592653589793045,
    ]);
    expect(result.machine).toEqual({
      state: expect.any(Number),
      samplesDrawn: 1000,
      inside: 770,
      status: "complete",
    });
  });

  it("compares fixtures by sample count and exposes seed-dependent estimates", () => {
    const rows = monteCarloComparison(Object.values(MONTE_CARLO_SCENARIOS));

    expect(rows.map((row) => row.samples)).toEqual([1000, 10000, 10000, 100000]);
    const medium = rows.find((row) => row.id === "medium")!;
    const sameCount = rows.find((row) => row.id === "same-n-different-seed")!;
    const large = rows.find((row) => row.id === "large")!;

    expect(medium.estimate).toBeCloseTo(3.1448, 4);
    expect(medium.error).toBeCloseTo(0.003207346410206924, 9);
    expect(sameCount.estimate).toBeCloseTo(3.1328, 4);
    expect(large.estimate).toBeCloseTo(3.14012, 5);
    expect(large.error).toBeLessThan(medium.error);
    expect(medium.error).toBeLessThan(rows.find((row) => row.id === "small")!.error);
  });

  it("rejects malformed scenarios and preserves terminal identity", () => {
    const scenario = getMonteCarloScenario("small");
    expect(() => runMonteCarlo({ ...scenario, seed: -1 })).toThrow(/seed/i);
    expect(() => runMonteCarlo({ ...scenario, seed: 1.5 })).toThrow(/seed/i);
    expect(() => runMonteCarlo({ ...scenario, samples: 0 })).toThrow(/sample/i);
    expect(() => runMonteCarlo({ ...scenario, samples: 1001 })).toThrow(/batch/i);
    expect(() => runMonteCarlo({ ...scenario, batchSize: 0 })).toThrow(/batch/i);
    expect(() => runMonteCarlo({ ...scenario, title: "" })).toThrow(/title/i);

    const complete = runMonteCarlo(scenario).machine;
    const after = stepMonteCarlo(complete, scenario);
    expect(after.machine).toBe(complete);
    expect(after.frame).toBeUndefined();
    expect(after.done).toBe(true);
  });

  it("keeps snapshots independent across frames", () => {
    const result = runMonteCarlo(getMonteCarloScenario("small"));
    (result.frames[0].after as { samplesDrawn: number }).samplesDrawn = 0;
    (result.frames[0].before as { inside: number }).inside = 999;

    expect(result.frames[1].before.samplesDrawn).toBe(250);
    expect(result.frames[1].after.inside).toBe(375);
    expect(result.machine.samplesDrawn).toBe(1000);
    expect(result.machine.inside).toBe(770);
  });
});
