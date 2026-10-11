import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { SaveIndicator } from "../../../shared/lab/LabGate";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { DecodingWorkspace } from "../ui/DecodingWorkspace.tsx";
import { createDecodingPreviewActions, decodingPreviewFixtures } from "./fixtures.ts";
import "./preview.css";

const VIEWPORTS = [
  { id: "desktop", label: "桌面 · 1440", width: 1440 },
  { id: "tablet", label: "平板 · 820", width: 820 },
  { id: "mobile", label: "手机 · 393", width: 393 },
];

export function DecodingPreviewPage() {
  const search = useSearch({ strict: false });
  const navigate = useNavigate({ from: "/__dev/labs/decoding" });
  const router = useRouter();
  const scene =
    decodingPreviewFixtures.find((f) => f.id === search.scenario) ?? decodingPreviewFixtures[0];
  const viewport = VIEWPORTS.find((v) => v.id === search.viewport) ?? VIEWPORTS[0];
  const [lastAction, setLastAction] = useState("尚未操作");
  const actions = createDecodingPreviewActions(setLastAction);

  if (search.frame === "1") {
    return (
      <AppPageLayout
        className="decoding-lab"
        topbar={<SaveIndicator status={scene.model.feedback.saveStatus} />}
        topbarProps={{
          title: scene.model.stage?.title,
          subtitle: scene.model.stage?.englishTitle,
          showAccount: false,
        }}
      >
        <p className="decoding-preview-event" data-scene={scene.id} role="status">
          固定场景 · 仅记录操作：{lastAction}
        </p>
        <DecodingWorkspace model={scene.model} actions={actions} />
      </AppPageLayout>
    );
  }

  const frameSrc = router.buildLocation({
    to: ".",
    search: { scenario: scene.id, frame: "1" },
  }).href;
  return (
    <AppPageLayout
      className="decoding-preview"
      topbarProps={{
        title: "解码侦探视觉开发预览",
        subtitle: "固定公开数据 · 无需登录或后端",
        showAccount: false,
      }}
    >
      <div className="page-content decoding-preview-controls">
        <label>
          固定场景
          <select
            value={scene.id}
            onChange={(e) => void navigate({ search: { ...search, scenario: e.target.value } })}
          >
            {decodingPreviewFixtures.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          预览视口
          <select
            value={viewport.id}
            onChange={(e) => void navigate({ search: { ...search, viewport: e.target.value } })}
          >
            {VIEWPORTS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <p>操作只记录事件；切换场景查看其他状态。视口使用 iframe，真实触发媒体查询。</p>
      </div>
      <div className="decoding-preview-frame-scroll">
        <iframe
          key={frameSrc}
          title="解码侦探实验预览"
          src={frameSrc}
          style={{ width: viewport.width }}
        />
      </div>
    </AppPageLayout>
  );
}
