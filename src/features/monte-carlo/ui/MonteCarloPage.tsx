import { useEffect, useMemo, useReducer, type Dispatch } from "react";
import { useSearch } from "@tanstack/react-router";
import { LabShell } from "../../../shared/lab/LabShell";
import {
  MONTE_CARLO_SCENARIOS,
  monteCarloComparison,
  type MonteCarloFrame,
  type MonteCarloScenarioId,
} from "../domain";
import { parseMonteCarloScenario } from "../lesson/scenario";
import {
  createMonteCarloLessonState,
  transitionMonteCarloLesson,
  type MonteCarloLessonState,
} from "../lesson/state";
import { MonteCarloGeometry } from "./MonteCarloGeometry";
import "./monte-carlo.css";

const scenarioOptions: readonly {
  value: MonteCarloScenarioId;
  label: string;
  description: string;
}[] = [
  {
    value: "medium",
    label: "中等样本",
    description: "种子 2024，10,000 个样本，40 个批次。",
  },
  { value: "small", label: "小样本", description: "种子 42，1,000 个样本，4 个批次。" },
  {
    value: "large",
    label: "大样本",
    description: "种子 271828，100,000 个样本，400 个批次。",
  },
  {
    value: "same-n-different-seed",
    label: "样本数相同，不同种子",
    description: "种子 11，10,000 个样本：数量与中等样本相同，但轨迹不同。",
  },
];

const estimateText = (value: number) => value.toFixed(4);
const errorText = (value: number) => value.toFixed(4);

function ConvergenceTable({ frames }: { frames: readonly MonteCarloFrame[] }) {
  return (
    <table className="mc-table">
      <caption>批次收敛</caption>
      <thead>
        <tr>
          <th scope="col">批次</th>
          <th scope="col">样本</th>
          <th scope="col">圆内</th>
          <th scope="col">估计值</th>
          <th scope="col">|估计值 − π|</th>
        </tr>
      </thead>
      <tbody>
        {frames.length === 0 ? (
          <tr>
            <td colSpan={5}>还没有批次。</td>
          </tr>
        ) : (
          frames.map((frame) => (
            <tr key={frame.batch}>
              <th scope="row">{frame.batch}</th>
              <td>{frame.sampleCount}</td>
              <td>{frame.insideCount}</td>
              <td>{estimateText(frame.estimate)}</td>
              <td>{errorText(frame.error)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function FrameTrace({
  frames,
  selectedFrameIndex,
  onSelect,
}: {
  frames: readonly MonteCarloFrame[];
  selectedFrameIndex?: number;
  onSelect: (index: number) => void;
}) {
  return (
    <section className="mc-card" aria-label="蒙特卡洛批次记录">
      <div className="mc-card-heading">
        <div>
          <p className="eyebrow">批次记录</p>
          <h3>采样批次</h3>
        </div>
        <span>{frames.length} 个批次</span>
      </div>
      {frames.length === 0 ? (
        <p>点击“执行一步”，生成前 250 个随机点。</p>
      ) : (
        <ol className="mc-trace-list">
          {frames.map((frame) => (
            <li key={frame.batch}>
              <button
                aria-current={selectedFrameIndex === frame.index ? "true" : undefined}
                aria-label={`第 ${frame.batch} 批，${frame.sampleCount} 个样本，${frame.insideCount} 个在圆内，估计值 ${estimateText(frame.estimate)}`}
                className={selectedFrameIndex === frame.index ? "is-selected" : ""}
                onClick={() => onSelect(frame.index)}
                type="button"
              >
                <strong>第 {frame.batch} 批</strong>
                <span>
                  {frame.sampleCount} 个样本 · {frame.insideCount} 个在圆内
                </span>
                <small>π ≈ {estimateText(frame.estimate)}</small>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function SelectedEvidence({ frame }: { frame?: MonteCarloFrame }) {
  if (!frame) {
    return (
      <section className="mc-card" aria-label="选中蒙特卡洛结果">
        <p className="eyebrow">选中结果</p>
        <h3>执行一步，检查一个批次</h3>
        <p>选中的批次会显示累计样本、圆内计数、估计值和误差。</p>
      </section>
    );
  }
  return (
    <section className="mc-card" aria-label="选中蒙特卡洛结果">
      <div className="mc-card-heading">
        <div>
          <p className="eyebrow">选中结果</p>
          <h3>
            第 {frame.batch} 批，共 {frame.after.samplesDrawn} 个样本
          </h3>
        </div>
        <span>4 × 圆内 ÷ 样本</span>
      </div>
      <dl className="mc-facts">
        <div>
          <dt>批次前样本</dt>
          <dd>{frame.before.samplesDrawn}</dd>
        </div>
        <div>
          <dt>批次后样本</dt>
          <dd>{frame.sampleCount}</dd>
        </div>
        <div>
          <dt>批次前圆内计数</dt>
          <dd>{frame.before.inside}</dd>
        </div>
        <div>
          <dt>批次后圆内计数</dt>
          <dd>{frame.insideCount}</dd>
        </div>
        <div>
          <dt>整批圆内点数</dt>
          <dd>{frame.batchInsideCount}</dd>
        </div>
        <div>
          <dt>当前估计值</dt>
          <dd>{estimateText(frame.estimate)}</dd>
        </div>
        <div>
          <dt>当前误差</dt>
          <dd>{errorText(frame.error)}</dd>
        </div>
      </dl>
    </section>
  );
}

function MonteCarloContent({
  lesson,
  dispatch,
}: {
  lesson: MonteCarloLessonState;
  dispatch: Dispatch<Parameters<typeof transitionMonteCarloLesson>[1]>;
}) {
  const selectedFrame = lesson.frames.find((frame) => frame.index === lesson.selectedFrameIndex);
  const option = scenarioOptions.find((candidate) => candidate.value === lesson.scenario)!;
  const fixture = MONTE_CARLO_SCENARIOS[lesson.scenario];
  const comparison = useMemo(() => monteCarloComparison(Object.values(MONTE_CARLO_SCENARIOS)), []);
  const finalEstimate =
    lesson.machine.status === "complete"
      ? (4 * lesson.machine.inside) / lesson.machine.samplesDrawn
      : undefined;

  return (
    <div className="mc-page">
      <header className="mc-hero">
        <div>
          <p className="eyebrow">蒙特卡洛 · 随机采样</p>
          <h2>随机点估计 π</h2>
          <p>在单位正方形中生成随机点，按落入四分之一圆的比例估计 π。</p>
        </div>
        <div className="mc-fixture-card" aria-label="蒙特卡洛样例">
          <span>样例</span>
          <strong>{option.label}</strong>
          <small>
            种子 {fixture.seed} · {fixture.samples.toLocaleString("en-US")} 个样本 ·{" "}
            {fixture.samples / fixture.batchSize} 个批次，每批 {fixture.batchSize} 个
          </small>
        </div>
      </header>

      <div className="mc-layout">
        <aside className="mc-controls" aria-label="蒙特卡洛实验控制">
          <section className="mc-card">
            <p className="eyebrow">样例</p>
            <h3>选择样本规模</h3>
            <label htmlFor="mc-scenario">蒙特卡洛样例</label>
            <select
              id="mc-scenario"
              onChange={(event) =>
                dispatch({
                  type: "set-scenario",
                  scenario: event.target.value as MonteCarloScenarioId,
                })
              }
              value={lesson.scenario}
            >
              {scenarioOptions.map((candidate) => (
                <option key={candidate.value} value={candidate.value}>
                  {candidate.label}
                </option>
              ))}
            </select>
            <p>{option.description}</p>
          </section>

          <section className="mc-card">
            <p className="eyebrow">推进</p>
            <h3>推进采样</h3>
            <div className="mc-action-row">
              <button
                className="mc-primary-button"
                disabled={lesson.machine.status === "complete"}
                onClick={() => dispatch({ type: "step" })}
                type="button"
              >
                执行一步
              </button>
              <button
                className="mc-secondary-button"
                disabled={lesson.machine.status === "complete"}
                onClick={() => dispatch({ type: "run-all" })}
                type="button"
              >
                运行到结束
              </button>
            </div>
            <button
              className="mc-reset-button"
              onClick={() => dispatch({ type: "reset" })}
              type="button"
            >
              恢复初始情境
            </button>
          </section>
        </aside>

        <div className="mc-main-column">
          <section className="mc-card mc-status-card" aria-label="蒙特卡洛采样状态">
            <div>
              <p className="eyebrow">当前采样</p>
              <strong>{lesson.machine.status === "complete" ? "已完成" : "进行中"}</strong>
            </div>
            <dl>
              <div>
                <dt>已生成样本</dt>
                <dd>{lesson.machine.samplesDrawn}</dd>
              </div>
              <div>
                <dt>四分之一圆内</dt>
                <dd>{lesson.machine.inside}</dd>
              </div>
              <div>
                <dt>当前估计值</dt>
                <dd>
                  {lesson.machine.samplesDrawn > 0
                    ? estimateText((4 * lesson.machine.inside) / lesson.machine.samplesDrawn)
                    : "—"}
                </dd>
              </div>
            </dl>
          </section>
          <FrameTrace
            frames={lesson.frames}
            onSelect={(index) => dispatch({ type: "select-frame", index })}
            selectedFrameIndex={lesson.selectedFrameIndex}
          />
          <SelectedEvidence frame={selectedFrame} />
          {selectedFrame ? <MonteCarloGeometry frame={selectedFrame} /> : null}
          <section className="mc-card" aria-label="按批次收敛表">
            <p className="eyebrow">收敛</p>
            <h3>批次估计值</h3>
            <div className="mc-table-scroll">
              <ConvergenceTable frames={lesson.frames} />
            </div>
          </section>
          <section className="mc-card mc-final-card" aria-label="最终蒙特卡洛结果">
            <p className="eyebrow">最终蒙特卡洛结果</p>
            <h3>这个样例的估计值</h3>
            {finalEstimate === undefined ? (
              <p>运行样例到结束，比较它的最终估计值。</p>
            ) : (
              <>
                <output aria-label="最终蒙特卡洛估计值">
                  4 × {lesson.machine.inside} ÷ {lesson.machine.samplesDrawn} ≈{" "}
                  {estimateText(finalEstimate)}
                </output>
                <p>
                  相对 π = {Math.PI.toFixed(4)} 的最终误差为{" "}
                  {errorText(Math.abs(finalEstimate - Math.PI))}。
                </p>
              </>
            )}
          </section>
          <section className="mc-card" aria-label="蒙特卡洛比较">
            <p className="eyebrow">比较</p>
            <h3>数量相同但种子不同；样本越多，误差通常越小</h3>
            <div className="mc-table-scroll">
              <table className="mc-table">
                <caption>样例比较</caption>
                <thead>
                  <tr>
                    <th scope="col">样例</th>
                    <th scope="col">种子</th>
                    <th scope="col">样本</th>
                    <th scope="col">最终估计值</th>
                    <th scope="col">最终误差</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">{row.title}</th>
                      <td>{row.seed}</td>
                      <td>{row.samples.toLocaleString("en-US")}</td>
                      <td>{estimateText(row.estimate)}</td>
                      <td>{errorText(row.error)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mc-claim">
              在这些样例中，样本增加时最终误差通常变小；批次表显示每批波动，样本数相同的样例显示种子带来的轨迹差异。
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export function MonteCarloPage() {
  const search = useSearch({ from: "/labs/monte-carlo" }) as Record<string, unknown>;
  const scenario = useMemo(() => parseMonteCarloScenario(search), [search]);
  const [lesson, dispatch] = useReducer(
    transitionMonteCarloLesson,
    scenario,
    createMonteCarloLessonState,
  );

  useEffect(() => {
    dispatch({ type: "sync-url-scenario", scenario: scenario.scenario });
  }, [scenario.scenario]);

  return (
    <LabShell eyebrow="蒙特卡洛" title="蒙特卡洛 π" subtitle="随机点与 π 估计">
      <MonteCarloContent dispatch={dispatch} lesson={lesson} />
    </LabShell>
  );
}
