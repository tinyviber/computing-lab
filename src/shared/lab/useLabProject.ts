import { useEffect, useRef, useState } from "react";
import { api, describeApiError, type LabProjectPayload } from "../api/client";

/**
 * Fetches `GET /api/classes/:classId/labs/:labId/project` once the caller is
 * authenticated, then hands the payload to `toAction` so the lab's own
 * reducer folds it into lesson state. Lab-specific payload fields flow
 * through the `TExtras` generic.
 *
 * Every request is ticketed: a response only dispatches while it is still
 * the latest request, so a slow fetch for a previous classId/labId can never
 * overwrite the state the newer request belongs to.
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
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!classId || !ready) return;
    const ticket = ++requestSeq.current;
    setProjectLoaded(false);
    setLoadError(null);
    void api
      .get<LabProjectPayload<TDraft> & TExtras>(`/api/classes/${classId}/labs/${labId}/project`)
      .then((project) => {
        if (requestSeq.current !== ticket) return;
        dispatch(toAction(project));
        setProjectLoaded(true);
      })
      .catch((error) => {
        if (requestSeq.current !== ticket) return;
        setLoadError(describeApiError(error));
        setProjectLoaded(true);
      });
    return () => {
      // Superseded by a newer request (or unmounted): the response, if it
      // still arrives, finds a stale ticket and is dropped.
      if (requestSeq.current === ticket) requestSeq.current += 1;
    };
  }, [classId, labId, ready]);

  return { projectLoaded, loadError };
}
