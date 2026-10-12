import { useNavigate, useSearch } from "@tanstack/react-router";
import { DirectionB } from "./b/DirectionB";
import { SCENARIOS, scenarioById } from "./core/scenarios";
import "./core/base.css";
import "./preview.css";

export function CpuDirectionBPreviewPage() {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const sceneId = typeof search.scenario === "string" ? search.scenario : "initial";
  const scene = scenarioById(sceneId);

  return (
    <div className="cpu-direction-b-preview">
      <header className="cpu-direction-b-preview__bar">
        <div>
          <p className="cpu-direction-b-preview__eyebrow">设计探索 · 方向 B</p>
          <h1>芯片桌</h1>
        </div>
        <label>
          演示状态
          <select
            value={scene.id}
            onChange={(event) =>
              void navigate({
                to: "/__dev/labs/cpu-direction-b",
                search: { scenario: event.target.value },
              })
            }
          >
            {SCENARIOS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.n}. {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="cpu-direction-b-preview__note">
          独立设计预览 · 使用本地演示数据，不连接账户或服务
        </p>
      </header>
      <DirectionB key={scene.id} initial={scene.build} />
    </div>
  );
}
