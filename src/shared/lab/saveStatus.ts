import type { SaveStatus } from "../api/client";

/**
 * Autosave flags kept per stage. Save timers are armed per stage, so a save
 * that resolves after a stage switch must only settle its own stage's flag —
 * it can never overwrite the flag of the stage the student is looking at.
 */
export type SaveStatusByStage = Readonly<Partial<Record<number, SaveStatus>>>;

/** The flag for one stage; a stage with no save activity reads "idle". */
export function statusForStage(map: SaveStatusByStage, stageIndex: number): SaveStatus {
  return map[stageIndex] ?? "idle";
}

/** Sets one stage's flag without disturbing the other stages' entries. */
export function markSaveStatus(
  map: SaveStatusByStage,
  stageIndex: number,
  status: SaveStatus,
): SaveStatusByStage {
  if (status === "idle") {
    if (map[stageIndex] === undefined) return map;
    const next = { ...map };
    delete next[stageIndex];
    return next;
  }
  if (map[stageIndex] === status) return map;
  return { ...map, [stageIndex]: status };
}
