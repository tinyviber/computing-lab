import { useParams } from "@tanstack/react-router";
import { useAuth } from "../../../shared/auth";
import { LabAccessGate, SaveIndicator } from "../../../shared/lab/LabGate";
import { useLabCatalog } from "../../../shared/lab/labs";
import { labMetadata } from "../../../shared/lab/labMetadata";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { useCpuLabController } from "../controller/useCpuLabController.ts";
import { CpuWorkspace } from "./CpuWorkspace.tsx";
import "./cpu.css";

export function CpuLabPage() {
  const { classId } = useParams({ from: "/classes/$classId/labs/cpu" });
  const { status, role, session } = useAuth();
  const catalog = useLabCatalog(status === "authenticated");
  const controller = useCpuLabController({
    classId,
    ready: status === "authenticated",
    userId: session?.user.id ?? "",
  });
  const { model } = controller;
  return (
    <LabAccessGate
      classId={classId}
      closed={catalog?.get("cpu")?.visible === false}
      labName={labMetadata.cpu.title}
      role={role}
      status={status}
    >
      <AppPageLayout
        className="cpu-lab"
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
          subtitle: model.stage?.englishTitle,
          title: model.stage?.title ?? labMetadata.cpu.title,
        }}
      >
        <CpuWorkspace {...controller} />
      </AppPageLayout>
    </LabAccessGate>
  );
}
