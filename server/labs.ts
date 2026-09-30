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

/** Teacher-closed class ids keyed by lab id (lab_class_settings.open = 0). */
function teacherClosedClasses(db: DatabaseSync): Map<string, Set<string>> {
  const rows = db
    .prepare("SELECT lab_id AS labId, class_id AS classId FROM lab_class_settings WHERE open = 0")
    .all() as { labId: string; classId: string }[];
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = map.get(row.labId) ?? new Set<string>();
    set.add(row.classId);
    map.set(row.labId, set);
  }
  return map;
}

/** Whether a teacher closed this lab for one class (missing row = open). */
export function isLabClosedForClass(db: DatabaseSync, labId: string, classId: string): boolean {
  const row = db
    .prepare("SELECT open FROM lab_class_settings WHERE lab_id = ? AND class_id = ?")
    .get(labId, classId) as { open: number } | undefined;
  return row?.open === 0;
}

/** Persist a teacher's per-class switch for one of their classes. */
export function setLabClassOpen(
  db: DatabaseSync,
  labId: string,
  classId: string,
  open: boolean,
): void {
  db.prepare(
    `INSERT INTO lab_class_settings (lab_id, class_id, open) VALUES (?, ?, ?)
     ON CONFLICT (lab_id, class_id) DO UPDATE SET
       open = excluded.open,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).run(labId, classId, open ? 1 : 0);
}

/**
 * Whether the user may open the lab at all: admins always; a hidden lab
 * blocks everyone else; an open lab admits members of the checked classes
 * (all classes when no scope is pinned). A teacher's per-class switch can
 * further close the lab for a class's students — teachers themselves keep
 * preview access inside the admin scope so they can judge before opening.
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
  const mine = memberClassIds(db, user.id);
  const admitted =
    v.openClassIds === null ? mine : new Set(v.openClassIds.filter((id) => mine.has(id)));
  if (v.openClassIds === null && mine.size === 0) return true;
  if (admitted.size === 0) return false;
  if (user.role === "teacher") return true;
  const closed = teacherClosedClasses(db).get(labId);
  if (!closed) return true;
  for (const classId of admitted) if (!closed.has(classId)) return true;
  return false;
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
  if (v.openClassIds !== null && !v.openClassIds.includes(classId)) return false;
  return !isLabClosedForClass(db, labId, classId);
}

/**
 * Registry rows joined with the stored visibility. `visible` is the access
 * verdict for this user (admins see everything, including hidden labs, so
 * they can preview and reopen them). `visibleClassIds` lists the caller's
 * own classes whose students may take the lab — entry redirects and the
 * dashboard picker use it to land on a class that is actually open.
 */
export function labCatalog(
  db: DatabaseSync,
  user: SessionUser,
): (LabInfo & LabVisibility & { visible: boolean; visibleClassIds: string[] })[] {
  const rows = visibilityRows(db);
  const closed = teacherClosedClasses(db);
  const mine = memberClassIds(db, user.id);
  return LAB_REGISTRY.map((lab) => {
    const v = rows.get(lab.id) ?? OPEN_TO_ALL;
    let visible: boolean;
    let visibleClassIds: string[];
    if (user.role === "admin") {
      visible = true;
      visibleClassIds = [...mine];
    } else if (v.hidden) {
      visible = false;
      visibleClassIds = [];
    } else {
      const labClosed = closed.get(lab.id);
      visibleClassIds = [...mine].filter(
        (id) => (v.openClassIds === null || v.openClassIds.includes(id)) && !labClosed?.has(id),
      );
      // A teacher's own switches only gate students — they keep preview
      // access through any admin-scoped membership.
      visible =
        user.role === "teacher"
          ? v.openClassIds === null || v.openClassIds.some((id) => mine.has(id))
          : visibleClassIds.length > 0 || (v.openClassIds === null && mine.size === 0);
    }
    return { ...lab, ...v, visible, visibleClassIds };
  });
}

/** One class cell of the teacher lab-management grid. */
export type LabClassGate = {
  classId: string;
  /** The admin scope admits this class (hidden labs admit none). */
  adminAllowed: boolean;
  /** The teacher's own switch for this class; defaults to open. */
  teacherOpen: boolean;
  /** What this class's students experience. */
  open: boolean;
};

/**
 * Labs joined with the caller's own-class gate cells — the teacher
 * management view. `hidden`/`openClassIds` are the admin layer; each gate
 * resolves to `open` for the class's students.
 */
export function teacherLabView(
  db: DatabaseSync,
  classIds: string[],
): (LabInfo & LabVisibility & { classes: LabClassGate[] })[] {
  const rows = visibilityRows(db);
  const closed = teacherClosedClasses(db);
  return LAB_REGISTRY.map((lab) => {
    const v = rows.get(lab.id) ?? OPEN_TO_ALL;
    const classes = classIds.map((classId) => {
      const adminAllowed =
        !v.hidden && (v.openClassIds === null || v.openClassIds.includes(classId));
      const teacherOpen = !closed.get(lab.id)?.has(classId);
      return { classId, adminAllowed, teacherOpen, open: adminAllowed && teacherOpen };
    });
    return { ...lab, ...v, classes };
  });
}
