/**
 * Server-side lab registry: the dashboard allowlist. Stage counts come from
 * the feature domain modules — server→features imports are an established
 * precedent (see routes/calculator.ts).
 */

import type { DatabaseSync } from "node:sqlite";
import { CALCULATOR_STAGES } from "../src/features/calculator/domain/stages.ts";
import { COLOR_QUANT_STAGES } from "../src/features/color-quantization/domain/stages.ts";
import { CPU_STAGES } from "../src/features/cpu/domain/stages.ts";
import { IMAGE_SAMPLING_STAGES } from "../src/features/image-sampling/domain/stages.ts";
import { IS_SIM_STAGES } from "../src/features/is-sim/domain/stages.ts";

export type LabInfo = {
  id: string;
  stageCount: number;
};

export const LAB_REGISTRY: LabInfo[] = [
  { id: "calculator", stageCount: CALCULATOR_STAGES.length },
  { id: "image-sampling", stageCount: IMAGE_SAMPLING_STAGES.length },
  { id: "color-quantization", stageCount: COLOR_QUANT_STAGES.length },
  { id: "cpu", stageCount: CPU_STAGES.length },
  { id: "is-sim", stageCount: IS_SIM_STAGES.length },
];

export function labInfo(id: string | undefined): LabInfo | undefined {
  return LAB_REGISTRY.find((l) => l.id === id);
}

/** Ids of labs an admin has hidden; a missing lab_settings row means open. */
export function hiddenLabIds(db: DatabaseSync): Set<string> {
  const rows = db.prepare("SELECT lab_id AS id FROM lab_settings WHERE hidden = 1").all() as {
    id: string;
  }[];
  return new Set(rows.map((row) => row.id));
}

export function isLabHidden(db: DatabaseSync, labId: string): boolean {
  const row = db.prepare("SELECT hidden FROM lab_settings WHERE lab_id = ?").get(labId) as
    { hidden: number } | undefined;
  return row?.hidden === 1;
}

export function setLabHidden(db: DatabaseSync, labId: string, hidden: boolean): void {
  db.prepare(
    `INSERT INTO lab_settings (lab_id, hidden) VALUES (?, ?)
     ON CONFLICT (lab_id) DO UPDATE SET
       hidden = excluded.hidden,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).run(labId, hidden ? 1 : 0);
}

/** Registry rows joined with the stored hidden flag, for catalog endpoints. */
export function labCatalog(db: DatabaseSync): (LabInfo & { hidden: boolean })[] {
  const hidden = hiddenLabIds(db);
  return LAB_REGISTRY.map((lab) => ({ ...lab, hidden: hidden.has(lab.id) }));
}
