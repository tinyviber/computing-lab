import { useEffect, useState } from "react";
import { api } from "../api/client";

/** One row of GET /api/labs — the lab catalog every surface filters by. */
export type LabVisibility = {
  id: string;
  stageCount: number;
  /** Admin-preview labs never appear on teacher-facing surfaces. */
  teacherVisible: boolean;
  /** Admin-toggled: hidden labs are admin-only until reopened. */
  hidden: boolean;
};

export const LAB_TITLES: Record<string, string> = {
  calculator: "实现ALU",
  cpu: "冯诺依曼数据通路",
  "image-sampling": "空间采样",
  "color-quantization": "颜色量化",
};

/**
 * Fetches the lab catalog once `enabled` (i.e. the caller is signed in).
 * Returns null while loading, then a Map keyed by lab id — empty when the
 * request failed, so surfaces fail open and the API still enforces access.
 */
export function useLabCatalog(enabled: boolean): Map<string, LabVisibility> | null {
  const [catalog, setCatalog] = useState<Map<string, LabVisibility> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    void api
      .get<{ labs: LabVisibility[] }>("/api/labs")
      .then((payload) => setCatalog(new Map(payload.labs.map((lab) => [lab.id, lab]))))
      .catch(() => setCatalog(new Map()));
  }, [enabled]);
  return catalog;
}
