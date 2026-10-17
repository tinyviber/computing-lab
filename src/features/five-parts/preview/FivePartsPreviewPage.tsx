import { LabPreviewPage } from "../../../devtools/lab-preview/LabPreviewPage";
import { SaveIndicator } from "../../../shared/lab/LabGate";
import { FivePartsWorkspace } from "../ui/FivePartsWorkspace.tsx";
import { createFivePartsPreviewActions, fivePartsPreviewFixtures } from "./fixtures.ts";

export function FivePartsPreviewPage() {
  return (
    <LabPreviewPage
      createActions={createFivePartsPreviewActions}
      frameClassName="five-parts-lab"
      frameTitle="五大部件实验预览"
      frameTopbar={(scene) => <SaveIndicator status={scene.model.feedback.saveStatus} />}
      frameTopbarProps={(scene) => ({
        subtitle: scene.model.pageLabel,
        title: "计算机是怎么工作的？",
      })}
      renderWorkspace={(scene, actions) => (
        <FivePartsWorkspace actions={actions} model={scene.model} />
      )}
      scenes={fivePartsPreviewFixtures}
      subtitle="固定公开数据 · 无需登录或后端"
      title="五大部件视觉开发预览"
    />
  );
}
