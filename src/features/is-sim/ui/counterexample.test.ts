import { describe, expect, it } from "vitest";
import type { IsTopology } from "../domain/model.ts";
import type { IsCounterexample, IsJudgeResult } from "../domain/protocol.ts";
import { getIsStage } from "../domain/stages.ts";
import {
  COUNTEREXAMPLE_LISTED,
  counterexampleNodeIds,
  flaggedNodeIds,
  topologyKey,
} from "./counterexample.ts";

function counterexample(patch: Partial<IsCounterexample> = {}): IsCounterexample {
  return {
    name: "隐藏-1",
    category: "基础",
    reason: null,
    eventsUsed: 3,
    eventBudget: 10,
    scenario: { name: "隐藏-1", category: "基础", horizon: 10, script: [], expect: { events: 10 } },
    dbDiff: [],
    seenDiff: [],
    firedDiff: [],
    unapproved: [],
    pending: [],
    dropped: [],
    trace: [],
    ...patch,
  };
}

function verdict(passed: boolean, c: IsCounterexample | null): IsJudgeResult {
  return {
    score: passed ? 1 : 0,
    total: 1,
    passed,
    testSummary: { categories: {}, results: [], counterexample: c, error: null },
    submissionId: "s1",
    currentStage: 1,
    passedStages: passed ? [1] : [],
    unlockedComponent: null,
  };
}

describe("counterexampleNodeIds", () => {
  it("collects the devices named by all five per-device lists, in diff-text order", () => {
    const c = counterexample({
      dbDiff: [{ node: "books", expectedCount: 2, actualCount: 0 }],
      seenDiff: [{ node: "desk", expected: 2, actual: 0 }],
      firedDiff: [{ node: "sprinkler", expected: true, actual: false }],
      unapproved: [{ node: "db-main", port: "write", eventId: "e1", kind: "borrow", tick: 1 }],
      pending: [{ node: "librarian", count: 1 }],
    });
    expect(counterexampleNodeIds(c)).toEqual([
      "books",
      "desk",
      "sprinkler",
      "db-main",
      "librarian",
    ]);
  });

  it("dedupes, keeping first-seen order", () => {
    const c = counterexample({
      dbDiff: [{ node: "books", actualCount: 0 }],
      seenDiff: [{ node: "desk", expected: 1, actual: 0 }],
      unapproved: [{ node: "books", port: "write", eventId: "e2", kind: "borrow", tick: 2 }],
    });
    expect(counterexampleNodeIds(c)).toEqual(["books", "desk"]);
  });

  it("caps each list like the diff text does", () => {
    const ids = Array.from({ length: COUNTEREXAMPLE_LISTED + 1 }, (_, i) => `db-${i + 1}`);
    const c = counterexample({
      dbDiff: ids.map((node) => ({ node, actualCount: 0 })),
      seenDiff: [{ node: "desk", expected: 1, actual: 0 }],
    });
    expect(counterexampleNodeIds(c)).toEqual([...ids.slice(0, COUNTEREXAMPLE_LISTED), "desk"]);
  });

  it("ignores dropped events — a lost delivery names a link, not a culprit", () => {
    const c = counterexample({
      dropped: [
        {
          step: 1,
          tick: 1,
          eventId: "e1",
          kind: "borrow",
          payload: 7,
          from: "scan",
          to: "books",
          port: "write",
          cause: "link-down",
        },
      ],
    });
    expect(counterexampleNodeIds(c)).toEqual([]);
  });
});

describe("flaggedNodeIds", () => {
  const topology: IsTopology = getIsStage(1)!.prefill;
  const judgedKey = topologyKey(topology);
  const namesBooks = counterexample({
    dbDiff: [{ node: "books", expectedCount: 2, actualCount: 0 }],
  });

  it("flags the named devices while the judged topology is on the canvas", () => {
    expect([...flaggedNodeIds(verdict(false, namesBooks), judgedKey, topology)]).toEqual(["books"]);
  });

  it("flags nothing without a verdict, or for a pass", () => {
    expect(flaggedNodeIds(null, judgedKey, topology).size).toBe(0);
    expect(flaggedNodeIds(verdict(true, namesBooks), judgedKey, topology).size).toBe(0);
  });

  it("flags nothing for a failure without a counterexample", () => {
    expect(flaggedNodeIds(verdict(false, null), judgedKey, topology).size).toBe(0);
  });

  it("flags nothing once the canvas no longer shows the judged topology", () => {
    const edited: IsTopology = {
      ...topology,
      links: [{ from: "scan", to: "books", port: "write" }],
    };
    expect(flaggedNodeIds(verdict(false, namesBooks), judgedKey, edited).size).toBe(0);
    expect(flaggedNodeIds(verdict(false, namesBooks), null, topology).size).toBe(0);
  });

  it("keeps only ids present in the current topology", () => {
    const c = counterexample({
      dbDiff: [{ node: "books", actualCount: 0 }],
      pending: [{ node: "ghost", count: 1 }],
    });
    expect([...flaggedNodeIds(verdict(false, c), judgedKey, topology)]).toEqual(["books"]);
  });
});
