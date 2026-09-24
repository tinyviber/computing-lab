/**
 * Reducer tests for the is-sim lesson: draft edits stay inside the
 * domain contract (one driver per port, fixed furniture protected) and
 * edits invalidate prior verdicts.
 */

import { describe, expect, it } from "vitest";
import { createIsLessonState, draftOf, transitionIsLesson } from "./state.ts";

describe("is-sim lesson state", () => {
  it("starts a fresh stage draft from prefill furniture", () => {
    const state = createIsLessonState(1);
    const draft = draftOf(state);
    expect(draft.nodes.map((n) => n.id)).toEqual(["scan", "books"]);
    expect(draft.links).toEqual([]);
  });

  it("add-node respects the stage palette and grid capacity", () => {
    let state = createIsLessonState(1);
    // stage 1 palette: sensor + db only
    state = transitionIsLesson(state, { type: "add-node", kind: "gateway" });
    expect(draftOf(state).nodes).toHaveLength(2);
    state = transitionIsLesson(state, { type: "add-node", kind: "db" });
    expect(draftOf(state).nodes).toHaveLength(3);
  });

  it("fixed nodes cannot be removed", () => {
    let state = createIsLessonState(1);
    state = transitionIsLesson(state, { type: "remove-node", nodeId: "books" });
    expect(draftOf(state).nodes.map((n) => n.id)).toEqual(["scan", "books"]);
  });

  it("a second wire into the same port replaces the first", () => {
    let state = createIsLessonState(2);
    state = transitionIsLesson(state, { type: "add-node", kind: "gateway" });
    state = transitionIsLesson(state, {
      type: "add-link",
      link: { from: "scan-a", to: "books", port: "write" },
    });
    state = transitionIsLesson(state, {
      type: "add-link",
      link: { from: "scan-b", to: "books", port: "write" },
    });
    expect(draftOf(state).links).toEqual([{ from: "scan-b", to: "books", port: "write" }]);
  });

  it("rejects links into invalid ports", () => {
    let state = createIsLessonState(1);
    state = transitionIsLesson(state, {
      type: "add-link",
      link: { from: "scan", to: "books", port: "nope" },
    });
    expect(draftOf(state).links).toEqual([]);
  });

  it("edits clear prior run/judge outcomes", () => {
    let state = createIsLessonState(1);
    state = {
      ...state,
      runOutcome: { results: [], score: 0, total: 0 },
      judgeOutcome: null,
    };
    state = transitionIsLesson(state, {
      type: "add-link",
      link: { from: "scan", to: "books", port: "write" },
    });
    expect(state.runOutcome).toBeNull();
    expect(state.saveStatus).toBe("dirty");
  });

  it("select-stage refuses locked stages", () => {
    let state = createIsLessonState(1);
    state = transitionIsLesson(state, { type: "select-stage", stageIndex: 3 });
    expect(state.stageIndex).toBe(1);
    state = transitionIsLesson(state, {
      type: "load-project",
      currentStage: 3,
      passedStages: [1, 2],
      drafts: {},
    });
    state = transitionIsLesson(state, { type: "select-stage", stageIndex: 3 });
    expect(state.stageIndex).toBe(3);
  });
});
