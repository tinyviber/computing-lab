import { useEffect, useMemo, useReducer, type Dispatch } from "react";
import { useSearch } from "@tanstack/react-router";
import { LabShell } from "../../../shared/lab/LabShell";
import { type Utf8ByteEvidence, type Utf8Frame, type Utf8ScenarioId } from "../domain";
import { parseUtf8Scenario } from "../lesson/scenario";
import { createUtf8LessonState, transitionUtf8Lesson, type Utf8LessonState } from "../lesson/state";
import "./utf8.css";

const scenarioOptions: readonly { value: Utf8ScenarioId; label: string; description: string }[] = [
  {
    value: "mixed",
    label: "混合文本",
    description: "包含 ASCII、带重音拉丁字母、CJK 与表情符号。",
  },
  { value: "ascii", label: "ASCII", description: "一个码点可以放入一个字节。" },
  { value: "accent", label: "带重音拉丁字母", description: "一个两字节的 UTF-8 序列。" },
  { value: "cjk", label: "CJK 字符", description: "一个三字节的 UTF-8 序列。" },
  { value: "emoji", label: "表情符号", description: "一个四字节的 UTF-8 序列。" },
];

function codePointLabel(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

function branchLabel(branch: Utf8Frame["evidence"]["branch"]): string {
  return `${branch.split("-")[0]} 字节分支`;
}

function evidenceExplanation(frame: Utf8Frame): string {
  const count = frame.evidence.bytes.length;
  return `这个 Unicode 编号按 ${count} 字节模板拆分数据位，得到右侧的 UTF-8 字节。`;
}

function ByteTable({ bytes, caption }: { bytes: readonly Utf8ByteEvidence[]; caption: string }) {
  return (
    <table className="utf8-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">字节</th>
          <th scope="col">十进制</th>
          <th scope="col">二进制</th>
        </tr>
      </thead>
      <tbody>
        {bytes.length === 0 ? (
          <tr>
            <th scope="row">输出</th>
            <td colSpan={2}>—</td>
          </tr>
        ) : (
          bytes.map((byte, index) => (
            <tr key={`${byte.decimal}-${index}`}>
              <th scope="row">{index + 1}</th>
              <td>{byte.decimal}</td>
              <td className="utf8-mono">{byte.binary}</td>
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
  frames: readonly Utf8Frame[];
  selectedFrameIndex?: number;
  onSelect: (index: number) => void;
}) {
  return (
    <section className="utf8-card" aria-label="UTF-8 帧记录">
      <div className="utf8-card-heading">
        <div>
          <p className="eyebrow">码点记录</p>
          <h3>每帧处理一个码点</h3>
        </div>
        <span>{frames.length} 帧</span>
      </div>
      {frames.length === 0 ? (
        <p>点击“执行一步”，检查第一个标量到字节的转换。</p>
      ) : (
        <ol className="utf8-trace-list">
          {frames.map((frame) => (
            <li key={frame.index}>
              <button
                aria-current={selectedFrameIndex === frame.index ? "true" : undefined}
                aria-label={`第 ${frame.index + 1} 帧，${frame.evidence.character}，${codePointLabel(frame.evidence.codePoint)}，${branchLabel(frame.evidence.branch)}，${frame.evidence.bytes.length} 字节`}
                className={selectedFrameIndex === frame.index ? "is-selected" : ""}
                onClick={() => onSelect(frame.index)}
                type="button"
              >
                <strong>第 {frame.index + 1} 帧</strong>
                <span>
                  {frame.evidence.character} · {codePointLabel(frame.evidence.codePoint)} ·{" "}
                  {branchLabel(frame.evidence.branch)}
                </span>
                <small>{frame.evidence.bytes.length} 字节</small>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function SelectedEvidence({ frame }: { frame?: Utf8Frame }) {
  if (!frame) {
    return (
      <section className="utf8-card" aria-label="选中 UTF-8 证据">
        <p className="eyebrow">选中证据</p>
        <h3>执行一步，检查一个码点</h3>
        <p>选中的帧会显示 Unicode 编号、模板、数据位和生成的字节。</p>
      </section>
    );
  }
  return (
    <section className="utf8-card" aria-label="选中 UTF-8 证据">
      <div className="utf8-card-heading">
        <div>
          <p className="eyebrow">选中证据</p>
          <h3>
            {frame.evidence.character} · {codePointLabel(frame.evidence.codePoint)}
          </h3>
        </div>
        <span className="utf8-branch">{branchLabel(frame.evidence.branch)}</span>
      </div>
      <p>{evidenceExplanation(frame)}</p>
      <dl className="utf8-facts">
        <div>
          <dt>码点二进制</dt>
          <dd className="utf8-mono">{frame.evidence.codePointBinary}</dd>
        </div>
        <div>
          <dt>UTF-8 模板</dt>
          <dd className="utf8-mono">{frame.evidence.template}</dd>
        </div>
        <div>
          <dt>帧之前的输出</dt>
          <dd className="utf8-mono">{frame.before.bytes.join(" ") || "—"}</dd>
        </div>
        <div>
          <dt>帧之后的输出</dt>
          <dd className="utf8-mono">{frame.after.bytes.join(" ") || "—"}</dd>
        </div>
      </dl>
      <ByteTable bytes={frame.evidence.bytes} caption={`第 ${frame.index + 1} 帧生成的字节`} />
    </section>
  );
}

function Utf8Content({
  lesson,
  dispatch,
}: {
  lesson: Utf8LessonState;
  dispatch: Dispatch<Parameters<typeof transitionUtf8Lesson>[1]>;
}) {
  const selectedFrame = lesson.frames.find((frame) => frame.index === lesson.selectedFrameIndex);
  const option = scenarioOptions.find((candidate) => candidate.value === lesson.scenario)!;
  const visibleCount = [...getText(lesson.scenario)].length;
  return (
    <div className="utf8-page">
      <header className="utf8-hero">
        <div>
          <p className="eyebrow">UTF-8 · 表示路径</p>
          <h2>为什么四个可见字符会占十个字节？</h2>
          <p>查看每个 Unicode 编号经过范围规则和数据位模板后，怎样生成 UTF-8 字节。</p>
        </div>
        <div className="utf8-source-card" aria-label="UTF-8 源文本">
          <span>源文本</span>
          <strong>{getText(lesson.scenario)}</strong>
          <small>{option.description}</small>
        </div>
      </header>

      <div className="utf8-layout">
        <aside className="utf8-controls" aria-label="UTF-8 实验控制">
          <section className="utf8-card">
            <p className="eyebrow">预测</p>
            <h3>预测下一个分支</h3>
            <label htmlFor="utf8-branch-prediction">下一个码点分支</label>
            <select
              id="utf8-branch-prediction"
              onChange={(event) =>
                dispatch({ type: "set-branch-prediction", value: event.target.value })
              }
              value={lesson.predictionBranchDraft}
            >
              <option value="">请选择</option>
              <option value="1-byte">1 字节</option>
              <option value="2-byte">2 字节</option>
              <option value="3-byte">3 字节</option>
              <option value="4-byte">4 字节</option>
            </select>
            <label htmlFor="utf8-bytes-prediction">最终字节数</label>
            <input
              id="utf8-bytes-prediction"
              min={1}
              onChange={(event) =>
                dispatch({ type: "set-bytes-prediction", value: event.target.value })
              }
              type="number"
              value={lesson.predictionBytesDraft}
            />
            <p id="utf8-prediction-help">预测可选，也不会阻止执行。</p>
            <button
              className="utf8-secondary-button"
              onClick={() => dispatch({ type: "record-prediction" })}
              type="button"
            >
              记录预测
            </button>
            {lesson.predictionMessage ? <p role="status">预测已记录；编码仍可继续。</p> : null}
          </section>

          <section className="utf8-card">
            <p className="eyebrow">样例</p>
            <h3>选择源文本</h3>
            <label htmlFor="utf8-scenario">UTF-8 样例</label>
            <select
              id="utf8-scenario"
              onChange={(event) =>
                dispatch({ type: "set-scenario", scenario: event.target.value as Utf8ScenarioId })
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

          <section className="utf8-card">
            <p className="eyebrow">推进</p>
            <h3>推进编码过程</h3>
            <div className="utf8-action-row">
              <button
                className="utf8-primary-button"
                disabled={lesson.machine.status === "complete"}
                onClick={() => dispatch({ type: "step" })}
                type="button"
              >
                执行一步
              </button>
              <button
                className="utf8-secondary-button"
                disabled={lesson.machine.status === "complete"}
                onClick={() => dispatch({ type: "run-all" })}
                type="button"
              >
                运行到结束
              </button>
            </div>
            <button
              className="utf8-reset-button"
              onClick={() => dispatch({ type: "reset" })}
              type="button"
            >
              恢复初始情境
            </button>
          </section>
        </aside>

        <div className="utf8-main-column">
          <section className="utf8-card utf8-status-card" aria-label="UTF-8 编码状态">
            <div>
              <p className="eyebrow">当前编码</p>
              <strong>{lesson.machine.status === "complete" ? "已完成" : "进行中"}</strong>
            </div>
            <dl>
              <div>
                <dt>已处理码点</dt>
                <dd>{lesson.machine.nextIndex}</dd>
              </div>
              <div>
                <dt>可见码点</dt>
                <dd>{visibleCount}</dd>
              </div>
              <div>
                <dt>生成字节</dt>
                <dd>{lesson.machine.bytes.length}</dd>
              </div>
            </dl>
          </section>
          <FrameTrace
            frames={lesson.frames}
            onSelect={(index) => dispatch({ type: "select-frame", index })}
            selectedFrameIndex={lesson.selectedFrameIndex}
          />
          <SelectedEvidence frame={selectedFrame} />
          <section className="utf8-card utf8-final-card" aria-label="最终 UTF-8 结果">
            <p className="eyebrow">最终 UTF-8 结果</p>
            <h3>编码字节输出</h3>
            <output aria-label="编码后的 UTF-8 字节">
              {lesson.machine.bytes.join(" ") || "—"}
            </output>
            <p>
              {visibleCount} 个可见码点 → {lesson.machine.bytes.length} 个字节。
            </p>
            {lesson.predictionBranch ? (
              <p role="status">
                预测：{lesson.predictionBranch}；观察到的最终字节数： {lesson.machine.bytes.length}.
              </p>
            ) : null}
          </section>
          <section className="utf8-card" aria-label="UTF-8 字节比较">
            <p className="eyebrow">比较</p>
            <h3>可见数量不等于字节数量</h3>
            <ByteTable bytes={selectedFrame?.evidence.bytes ?? []} caption="选中码点的字节" />
          </section>
        </div>
      </div>
    </div>
  );
}

function getText(scenario: Utf8ScenarioId): string {
  return { ascii: "A", accent: "é", cjk: "猫", emoji: "🙂", mixed: "Aé猫🙂" }[scenario];
}

export function Utf8Page() {
  const search = useSearch({ from: "/labs/utf8" }) as Record<string, unknown>;
  const scenario = useMemo(() => parseUtf8Scenario(search), [search]);
  const [lesson, dispatch] = useReducer(transitionUtf8Lesson, scenario, createUtf8LessonState);

  useEffect(() => {
    dispatch({ type: "sync-url-scenario", scenario: scenario.scenario });
  }, [scenario.scenario]);

  return (
    <LabShell eyebrow="UTF-8" title="UTF-8 编码" subtitle="从码点到字节">
      <Utf8Content dispatch={dispatch} lesson={lesson} />
    </LabShell>
  );
}
