/**
 * Server-side lab registry: the dashboard allowlist. Stage counts come from
 * the feature domain modules — server→features imports are an established
 * precedent (see routes/calculator.ts).
 */

import { CALCULATOR_STAGES } from "../src/features/calculator/domain/stages.ts";
import { IMAGE_SAMPLING_STAGES } from "../src/features/image-sampling/domain/stages.ts";
import { COLOR_QUANT_STAGES } from "../src/features/color-quantization/domain/stages.ts";

export type LabInfo = {
  id: string;
  stageCount: number;
  /** Admin-preview labs stay invisible to teacher dashboards. */
  teacherVisible: boolean;
};

export const LAB_REGISTRY: LabInfo[] = [
  { id: "calculator", stageCount: CALCULATOR_STAGES.length, teacherVisible: true },
  { id: "image-sampling", stageCount: IMAGE_SAMPLING_STAGES.length, teacherVisible: false },
  { id: "color-quantization", stageCount: COLOR_QUANT_STAGES.length, teacherVisible: false },
];

export function labInfo(id: string | undefined): LabInfo | undefined {
  return LAB_REGISTRY.find((l) => l.id === id);
}
