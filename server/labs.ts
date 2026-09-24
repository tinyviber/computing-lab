/**
 * Server-side lab registry: the dashboard allowlist. Stage counts come from
 * the feature domain modules — server→features imports are an established
 * precedent (see routes/calculator.ts).
 */

import { stageCount as calculatorStageCount } from "../src/features/calculator/domain/stages.ts";
import { samplingStageCount } from "../src/features/image-sampling/domain/stages.ts";
import { quantStageCount } from "../src/features/color-quantization/domain/stages.ts";
import { cpuStageCount } from "../src/features/cpu/domain/stages.ts";

export type LabInfo = {
  id: string;
  stageCount: number;
  /** Admin-preview labs stay invisible to teacher dashboards. */
  teacherVisible: boolean;
};

export const LAB_REGISTRY: LabInfo[] = [
  { id: "calculator", stageCount: calculatorStageCount(), teacherVisible: true },
  { id: "image-sampling", stageCount: samplingStageCount(), teacherVisible: false },
  { id: "color-quantization", stageCount: quantStageCount(), teacherVisible: false },
  { id: "cpu", stageCount: cpuStageCount(), teacherVisible: true },
];

export function labInfo(id: string | undefined): LabInfo | undefined {
  return LAB_REGISTRY.find((l) => l.id === id);
}
