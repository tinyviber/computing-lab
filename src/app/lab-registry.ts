import { LAB_NAV_ITEMS } from "../shared/lab/navigation";
import type { LabDefinition } from "../shared/lab/contracts";

export type { LabDefinition } from "../shared/lab/contracts";
export type { LabCategory } from "../shared/lab/contracts";

export const labs: LabDefinition[] = LAB_NAV_ITEMS;

export function getLab(id: string): LabDefinition | undefined {
  return labs.find((lab) => lab.id === id);
}
