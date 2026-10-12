import { describe, expect, it } from "vitest";
import { markSaveStatus, statusForStage } from "./saveStatus";

describe("saveStatus helpers", () => {
  it("reads per-stage flags, defaulting to idle", () => {
    const map = { 2: "saving" as const };
    expect(statusForStage(map, 2)).toBe("saving");
    expect(statusForStage(map, 1)).toBe("idle");
  });

  it("marks a stage without touching others and drops idle keys", () => {
    const marked = markSaveStatus({ 1: "saved" }, 2, "dirty");
    expect(marked).toEqual({ 1: "saved", 2: "dirty" });
    expect(markSaveStatus(marked, 2, "idle")).toEqual({ 1: "saved" });
  });
});
