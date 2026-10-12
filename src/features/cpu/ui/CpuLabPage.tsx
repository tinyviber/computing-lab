import { useParams } from "@tanstack/react-router";
import { useAuth } from "../../../shared/auth";
import { LabAccessGate, SaveIndicator } from "../../../shared/lab/LabGate";
import { useLabCatalog } from "../../../shared/lab/labs";
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
      labName="冯诺依曼数据通路"
      role={role}
      status={status}
    >
      <AppPageLayout
        className="cpu-lab"
        topbar={<SaveIndicator status={model.feedback.saveStatus} />}
        topbarProps={{
          subtitle: model.stage?.englishTitle,
          title: model.stage?.title ?? "冯诺依曼数据通路",
        }}
      >
        <CpuWorkspace {...controller} />
      </AppPageLayout>
    </LabAccessGate>
  );
}
