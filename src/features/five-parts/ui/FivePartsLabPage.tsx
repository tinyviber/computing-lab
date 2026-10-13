/**
 * 五大部件 lab page: four pages share one project — the add walkthrough's
 * inputs and result carry over to the think page. The page owns only
 * wiring: auth gate, autosave hooks live in the controller, presentation
 * in the workspace.
 */

import { useParams } from "@tanstack/react-router";
import { useAuth } from "../../../shared/auth";
import { LabAccessGate, SaveIndicator } from "../../../shared/lab/LabGate";
import { useLabCatalog } from "../../../shared/lab/labs";
import { labMetadata } from "../../../shared/lab/labMetadata";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { useFivePartsLabController } from "../controller/useFivePartsLabController.ts";
import { FivePartsWorkspace } from "./FivePartsWorkspace.tsx";
import "./fiveParts.css";

export function FivePartsLabPage() {
  const { classId } = useParams({ from: "/classes/$classId/labs/five-parts" });
  const { status, role } = useAuth();
  const catalog = useLabCatalog(status === "authenticated");
  const controller = useFivePartsLabController({
    classId,
    ready: status === "authenticated",
  });
  const { model } = controller;
  return (
    <LabAccessGate
      classId={classId}
      closed={catalog?.get("five-parts")?.visible === false}
      labName={labMetadata["five-parts"].title}
      role={role}
      status={status}
    >
      <AppPageLayout
        className="five-parts-lab"
        topbar={
          <SaveIndicator
            status={model.feedback.saveStatus}
            unresolvedSyncConflict={model.feedback.unresolvedSyncConflict}
            onRetrySync={controller.actions.retrySyncConflict}
            onRestoreLocal={
              model.feedback.conflictLocalAvailable
                ? controller.actions.restoreConflictLocal
                : undefined
            }
            onDiscardLocal={
              model.feedback.conflictLocalAvailable
                ? controller.actions.discardConflictLocal
                : undefined
            }
          />
        }
        topbarProps={{
          subtitle: model.pageLabel,
          title: labMetadata["five-parts"].title,
        }}
      >
        <FivePartsWorkspace {...controller} />
      </AppPageLayout>
    </LabAccessGate>
  );
}
