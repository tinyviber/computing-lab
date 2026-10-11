import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { AppPageLayout, type AppTopbarProps } from "../../shared/layout/AppTopbar";
import "./lab-preview.css";

const VIEWPORTS = [
  { id: "desktop", label: "桌面 · 1440", width: 1440 },
  { id: "tablet", label: "平板 · 820", width: 820 },
  { id: "mobile", label: "手机 · 393", width: 393 },
] as const;

export type LabPreviewScene = { id: string; label: string };

/**
 * DEV-only preview shell for a lab's fixed scenes. The outer page offers a
 * scene picker and a viewport picker and embeds the lab in an iframe at
 * `?frame=1` so media queries trigger honestly. The lab supplies its
 * fixture scenes, an actions factory that records intents instead of
 * hitting the network, and its real workspace renderer.
 */
export function LabPreviewPage<A, S extends LabPreviewScene>({
  scenes,
  title,
  subtitle,
  frameTitle,
  frameClassName,
  frameTopbar,
  frameTopbarProps,
  createActions,
  renderWorkspace,
}: {
  /** Fixture scenes, e.g. `{ id, label, model }[]`; the first is the default. */
  scenes: readonly S[];
  /** Outer page heading, e.g. "CPU 视觉开发预览". */
  title: string;
  subtitle: string;
  /** iframe accessible title — tests locate the frame through it. */
  frameTitle: string;
  /** Page-layout class for the framed scene, e.g. "cpu-lab". */
  frameClassName?: string;
  /** Extra topbar node for the framed page, e.g. a SaveIndicator. */
  frameTopbar?: (scene: S) => ReactNode;
  /** Topbar title/subtitle derived from the scene. */
  frameTopbarProps?: (scene: S) => Pick<AppTopbarProps, "title" | "subtitle">;
  /** Lab action set, rewired to record intents instead of acting. */
  createActions: (record: (action: string) => void) => A;
  renderWorkspace: (scene: S, actions: A) => ReactNode;
}) {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const router = useRouter();
  const scene = scenes.find((s) => s.id === search.scenario) ?? scenes[0];
  const viewport = VIEWPORTS.find((v) => v.id === search.viewport) ?? VIEWPORTS[0];
  const [lastAction, setLastAction] = useState("尚未操作");
  const actions = createActions(setLastAction);

  if (!scene) return null;

  if (search.frame === "1") {
    return (
      <AppPageLayout
        className={frameClassName}
        topbar={frameTopbar?.(scene)}
        topbarProps={{ ...frameTopbarProps?.(scene), showAccount: false }}
      >
        <p className="lab-preview-event" data-scene={scene.id} role="status">
          固定场景 · 仅记录操作：{lastAction}
        </p>
        {renderWorkspace(scene, actions)}
      </AppPageLayout>
    );
  }

  const frameSrc = router.buildLocation({
    to: ".",
    search: { scenario: scene.id, frame: "1" },
  }).href;
  return (
    <AppPageLayout
      className="lab-preview"
      topbarProps={{
        title,
        subtitle,
        showAccount: false,
      }}
    >
      <div className="page-content lab-preview-controls">
        <label>
          固定场景
          <select
            value={scene.id}
            onChange={(e) =>
              void navigate({ to: ".", search: { ...search, scenario: e.target.value } })
            }
          >
            {scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          预览视口
          <select
            value={viewport.id}
            onChange={(e) =>
              void navigate({ to: ".", search: { ...search, viewport: e.target.value } })
            }
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
      <div className="lab-preview-frame-scroll">
        <iframe
          key={frameSrc}
          title={frameTitle}
          src={frameSrc}
          style={{ width: viewport.width }}
        />
      </div>
    </AppPageLayout>
  );
}
