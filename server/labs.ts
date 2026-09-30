/**
 * Server-side lab registry: the dashboard allowlist. Stage counts come from
 * the feature domain modules — server→features imports are an established
 * precedent (see routes/calculator.ts).
 */

import type { DatabaseSync } from "node:sqlite";
import { CALCULATOR_STAGES } from "../src/features/calculator/domain/stages.ts";
import { COLOR_QUANT_STAGES } from "../src/features/color-quantization/domain/stages.ts";
import { CPU_STAGES } from "../src/features/cpu/domain/stages.ts";
import { DECODING_STAGES } from "../src/features/decoding/domain/stages.ts";
import { IMAGE_SAMPLING_STAGES } from "../src/features/image-sampling/domain/stages.ts";
import { IS_SIM_STAGES } from "../src/features/is-sim/domain/stages.ts";
import type { SessionUser } from "./auth/session.ts";
import { parseJsonColumn } from "./db/client.ts";

export type LabInfo = {
  id: string;
  stageCount: number;
};

/**
 * Stored visibility of one lab. `hidden` locks the lab to admins; when open,
 * `openClassIds` scopes the audience — `null` means every class, an array of
 * class ids means only members of those classes ('[]' = no class).
 */
export type LabVisibility = {
  hidden: boolean;
  openClassIds: string[] | null;
};

const OPEN_TO_ALL: LabVisibility = { hidden: false, openClassIds: null };

export const LAB_REGISTRY: LabInfo[] = [
  { id: "calculator", stageCount: CALCULATOR_STAGES.length },
  { id: "image-sampling", stageCount: IMAGE_SAMPLING_STAGES.length },
  { id: "color-quantization", stageCount: COLOR_QUANT_STAGES.length },
  { id: "cpu", stageCount: CPU_STAGES.length },
  { id: "decoding", stageCount: DECODING_STAGES.length },
  { id: "is-sim", stageCount: IS_SIM_STAGES.length },
];

export function labInfo(id: string | undefined): LabInfo | undefined {
  return LAB_REGISTRY.find((l) => l.id === id);
}

/** lab_settings rows keyed by lab id; a missing row means open to all. */
function visibilityRows(db: DatabaseSync): Map<string, LabVisibility> {
  const rows = db
    .prepare("SELECT lab_id AS id, hidden, open_class_ids AS openClassIds FROM lab_settings")
    .all() as { id: string; hidden: number; openClassIds: string | null }[];
  const map = new Map<string, LabVisibility>();
  for (const row of rows) {
    map.set(row.id, {
      hidden: row.hidden === 1,
      openClassIds: parseJsonColumn<string[] | null>(row.openClassIds, null),
    });
  }
  return map;
}

export function labVisibility(db: DatabaseSync, labId: string): LabVisibility {
  return visibilityRows(db).get(labId) ?? OPEN_TO_ALL;
}

/**
 * Persist one lab's visibility. `openClassIds` omitted keeps the stored
 * scope; `null` reopens to every class; an array pins the checked classes.
 */
export function setLabVisibility(
  db: DatabaseSync,
  labId: string,
  update: { hidden: boolean; openClassIds?: string[] | null },
): LabVisibility {
  const next: LabVisibility = {
    hidden: update.hidden,
    openClassIds:
      update.openClassIds === undefined
        ? labVisibility(db, labId).openClassIds
        : update.openClassIds === null
          ? null
          : [...new Set(update.openClassIds)],
  };
  db.prepare(
    `INSERT INTO lab_settings (lab_id, hidden, open_class_ids) VALUES (?, ?, ?)
     ON CONFLICT (lab_id) DO UPDATE SET
       hidden = excluded.hidden,
       open_class_ids = excluded.open_class_ids,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).run(
    labId,
    next.hidden ? 1 : 0,
    next.openClassIds === null ? null : JSON.stringify(next.openClassIds),
  );
  return next;
}

/** Class ids the account belongs to (any member role). */
function memberClassIds(db: DatabaseSync, userId: string): Set<string> {
  const rows = db
    .prepare("SELECT class_id AS classId FROM class_members WHERE user_id = ?")
    .all(userId) as { classId: string }[];
  return new Set(rows.map((row) => row.classId));
}

/**
 * Whether the user may open the lab at all: admins always; a hidden lab
 * blocks everyone else; an open lab admits every member when the scope is
 * "all classes", otherwise anyone holding a membership in a checked class.
 */
export function canAccessLab(
  db: DatabaseSync,
  labId: string,
  user: SessionUser,
  visibility?: LabVisibility,
): boolean {
  if (user.role === "admin") return true;
  const v = visibility ?? labVisibility(db, labId);
  if (v.hidden) return false;
  if (v.openClassIds === null) return true;
  if (v.openClassIds.length === 0) return false;
  const mine = memberClassIds(db, user.id);
  return v.openClassIds.some((classId) => mine.has(classId));
}

/**
 * Whether the lab is open to one specific class — used by the teacher
 * dashboard, which reports a class's progress and is only meaningful when
 * that class itself may take the lab.
 */
export function isLabOpenToClass(
  db: DatabaseSync,
  labId: string,
  classId: string,
  visibility?: LabVisibility,
): boolean {
  const v = visibility ?? labVisibility(db, labId);
  if (v.hidden) return false;
  return v.openClassIds === null || v.openClassIds.includes(classId);
}

/**
 * Registry rows joined with the stored visibility, plus `visible` — the
 * access verdict for this user (admins see everything, including hidden
 * labs, so they can preview and reopen them).
 */
export function labCatalog(
  db: DatabaseSync,
  user: SessionUser,
): (LabInfo & LabVisibility & { visible: boolean })[] {
  const rows = visibilityRows(db);
  const mine = user.role === "admin" ? null : memberClassIds(db, user.id);
  return LAB_REGISTRY.map((lab) => {
    const v = rows.get(lab.id) ?? OPEN_TO_ALL;
    const visible =
      user.role === "admin" ||
      (!v.hidden &&
        (v.openClassIds === null || v.openClassIds.some((classId) => mine!.has(classId))));
    return { ...lab, ...v, visible };
  });
}
