import { useEffect, useState } from "react";
import { api, describeApiError, type LabProjectPayload } from "../api/client";

/**
 * Fetches `GET /api/classes/:classId/labs/:labId/project` once the caller is
 * authenticated, then hands the payload to `toAction` so the lab's own
 * reducer folds it into lesson state. Lab-specific payload fields flow
 * through the `TExtras` generic.
 */
export function useLabProject<TDraft, TExtras, TAction>(options: {
  classId: string | undefined;
  labId: string;
  /** Gate on auth — fetch only once status is "authenticated". */
  ready: boolean;
  toAction: (project: LabProjectPayload<TDraft> & TExtras) => TAction;
  dispatch: (action: TAction) => void;
}): { projectLoaded: boolean; loadError: string | null } {
  const { classId, labId, ready, toAction, dispatch } = options;
  const [projectLoaded, setProjectLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!classId || !ready) return;
    void api
      .get<LabProjectPayload<TDraft> & TExtras>(`/api/classes/${classId}/labs/${labId}/project`)
      .then((project) => {
        dispatch(toAction(project));
        setProjectLoaded(true);
      })
      .catch((error) => {
        setLoadError(describeApiError(error));
        setProjectLoaded(true);
      });
  }, [classId, labId, ready]);

  return { projectLoaded, loadError };
}
