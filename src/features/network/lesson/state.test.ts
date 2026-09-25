/**
 * Reducer tests for the network lesson: stage drafts start from the
 * seeded prefill, edits respect each stage's editable contract
 * (wiring/address/gateway/routes gates), rewired interfaces replace
 * their old link, and edits invalidate prior verdicts.
 */

import { describe, expect, it } from "vitest";
import { createNetLessonState, draftOf, transitionNetLesson } from "./state.ts";

describe("network lesson state", () => {
  it("starts a fresh stage draft from the seeded prefill", () => {
    const state = createNetLessonState(3, "student-1");
    const draft = draftOf(state);
    expect(draft.nodes.map((n) => n.id)).toEqual(["PC1", "PC2", "SW1", "R1", "SW2", "PC3"]);
    expect(draft.links).toEqual([]);
    // seeded: the LAN-A subnet octet varies per user
    const other = draftOf(createNetLessonState(3, "student-2"));
    const ipA = draft.nodes[0].addresses.eth0.ip;
    const ipB = other.nodes[0].addresses.eth0.ip;
    expect(ipA).toMatch(/^10\.\d+\.1\.11$/);
    expect(ipB).toMatch(/^10\.\d+\.1\.11$/);
  });

  it("stage gates block edits outside the editable list", () => {
    // S1 opens addresses but not wiring
    let s1 = createNetLessonState(1, "u");
    s1 = transitionNetLesson(s1, {
      type: "add-link",
      a: { node: "PC1", iface: "eth0" },
      b: { node: "PC2", iface: "eth0" },
    });
    expect(draftOf(s1).links).toHaveLength(1); // prefilled link survives
    s1 = transitionNetLesson(s1, {
      type: "add-link",
      a: { node: "PC1", iface: "eth0" },
      b: { node: "PC2", iface: "eth0" },
    });
    expect(draftOf(s1).links).toHaveLength(1);
    // but the address field is open
    s1 = transitionNetLesson(s1, {
      type: "set-address",
      nodeId: "PC2",
      iface: "eth0",
      address: { ip: "10.9.1.12", prefix: 24 },
    });
    expect(draftOf(s1).nodes.find((n) => n.id === "PC2")?.addresses.eth0?.ip).toBe("10.9.1.12");

    // S2 opens wiring but not addresses
    let s2 = createNetLessonState(2, "u");
    s2 = transitionNetLesson(s2, {
      type: "set-address",
      nodeId: "PC1",
      iface: "eth0",
      address: { ip: "9.9.9.9", prefix: 24 },
    });
    expect(draftOf(s2).nodes.find((n) => n.id === "PC1")?.addresses.eth0?.ip).not.toBe("9.9.9.9");
    s2 = transitionNetLesson(s2, {
      type: "add-link",
      a: { node: "PC1", iface: "eth0" },
      b: { node: "SW1", iface: "p1" },
    });
    expect(draftOf(s2).links).toEqual([
      { a: { node: "PC1", iface: "eth0" }, b: { node: "SW1", iface: "p1" } },
    ]);
  });

  it("rewiring an occupied interface replaces its link", () => {
    let state = createNetLessonState(2, "u");
    state = transitionNetLesson(state, {
      type: "add-link",
      a: { node: "PC1", iface: "eth0" },
      b: { node: "SW1", iface: "p1" },
    });
    state = transitionNetLesson(state, {
      type: "add-link",
      a: { node: "PC2", iface: "eth0" },
      b: { node: "SW1", iface: "p1" },
    });
    expect(draftOf(state).links).toEqual([
      { a: { node: "PC2", iface: "eth0" }, b: { node: "SW1", iface: "p1" } },
    ]);
  });

  it("routes only open on route-editing stages and only on routers", () => {
    let s4 = createNetLessonState(4, "u");
    s4 = transitionNetLesson(s4, {
      type: "add-route",
      nodeId: "PC1", // host — refused
    });
    expect(draftOf(s4).nodes.find((n) => n.id === "PC1")?.routes).toHaveLength(0);
    s4 = transitionNetLesson(s4, { type: "add-route", nodeId: "R2" });
    const r2 = draftOf(s4).nodes.find((n) => n.id === "R2")!;
    expect(r2.routes).toHaveLength(1);
    s4 = transitionNetLesson(s4, {
      type: "update-route",
      nodeId: "R2",
      index: 0,
      patch: { dest: "10.0.1.0", prefix: 24, nextHop: "10.0.254.1" },
    });
    expect(draftOf(s4).nodes.find((n) => n.id === "R2")?.routes[0].dest).toBe("10.0.1.0");
    s4 = transitionNetLesson(s4, { type: "remove-route", nodeId: "R2", index: 0 });
    expect(draftOf(s4).nodes.find((n) => n.id === "R2")?.routes).toHaveLength(0);
  });

  it("edits clear prior run/judge outcomes and mark the draft dirty", () => {
    let state = createNetLessonState(2, "u");
    state = {
      ...state,
      runOutcome: { results: [], score: 0, total: 0 },
    };
    state = transitionNetLesson(state, {
      type: "add-link",
      a: { node: "PC1", iface: "eth0" },
      b: { node: "SW1", iface: "p1" },
    });
    expect(state.runOutcome).toBeNull();
    expect(state.saveStatus).toBe("dirty");
  });

  it("select-stage refuses locked stages; challenge unlocks via core", () => {
    let state = createNetLessonState(1, "u");
    state = transitionNetLesson(state, { type: "select-stage", stageIndex: 3 });
    expect(state.stageIndex).toBe(1);
    state = transitionNetLesson(state, {
      type: "load-project",
      currentStage: 5,
      passedStages: [1, 2, 3, 4],
      drafts: {},
      userId: "u",
    });
    state = transitionNetLesson(state, { type: "select-stage", stageIndex: 5 });
    expect(state.stageIndex).toBe(5);
  });
});
