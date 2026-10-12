import { LabPreviewPage } from "../../../devtools/lab-preview/LabPreviewPage";
import { SaveIndicator } from "../../../shared/lab/LabGate";
import { CpuWorkspace } from "../ui/CpuWorkspace.tsx";
import { cpuPreviewFixtures, createCpuPreviewActions } from "./fixtures.ts";

export function CpuPreviewPage() {
  return (
    <LabPreviewPage
      createActions={createCpuPreviewActions}
      frameClassName="cpu-lab"
      frameTitle="CPU 实验预览"
      frameTopbar={(scene) => <SaveIndicator status={scene.model.feedback.saveStatus} />}
      frameTopbarProps={(scene) => ({
        subtitle: scene.model.stage?.englishTitle,
        title: scene.model.stage?.title,
      })}
      renderWorkspace={(scene, actions) => <CpuWorkspace model={scene.model} actions={actions} />}
      scenes={cpuPreviewFixtures}
      subtitle="固定公开数据 · 无需登录或后端"
      title="CPU 视觉开发预览"
    />
  );
}
