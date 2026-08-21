import { useEffect, useMemo, useReducer, type Dispatch } from "react";
import { useSearch } from "@tanstack/react-router";
import { LabShell } from "../../../shared/lab/LabShell";
import {
  BYTE_EDIT_PRESETS,
  decodeUtf8,
  getByteEditScenario,
  type ByteEditFrame,
  type ByteEditScenarioId,
} from "../domain";
import { parseByteEditScenario } from "../lesson/scenario";
import {
  createByteEditLessonState,
  transitionByteEditLesson,
  type ByteEditLessonState,
} from "../lesson/state";
import "./byte-edit.css";

const scenarioOptions: readonly { value: ByteEditScenarioId; label: string }[] = [
  { value: "mixed", label: "混合文本" },
  { value: "ascii", label: "ASCII" },
  { value: "accent", label: "带重音拉丁字母" },
  { value: "cjk", label: "CJK 字符" },
  { value: "emoji", label: "表情符号" },
];

const PRESET_LABELS: Record<string, string> = {
  original: "原始序列",
  truncated: "截断序列",
  overlong: "过长编码 A",
  surrogate: "代理项",
  "out-of-range": "超出范围",
  "corrupt-continuation": "损坏的延续字节",
};

const presetLabel = (id: string) => PRESET_LABELS[id] ?? id;

const DECODE_REASON_LABELS: Record<string, string> = {
  "byte value out of range": "字节值超出范围",
  "missing continuation byte": "缺少后续字节",
  "invalid continuation byte": "无效延续字节",
  "overlong encoding": "过长编码",
  "surrogate code point": "代理码点",
  "code point above U+10FFFF": "码点超出范围",
  "unexpected continuation byte": "意外的延续字节",
  "invalid lead byte": "无效起始字节",
};

const hexBytes = (bytes: readonly number[]) =>
  bytes.map((value) => value.toString(16).padStart(2, "0")).join(" ");

function DecodeEvidence({ decode }: { decode: ReturnType<typeof decodeUtf8> }) {
  return decode.valid ? (
    <p className="be-valid" role="status">
      有效 UTF-8 → “{decode.characters}” (
      {decode.codePoints
        .map((point) => `U+${point.toString(16).toUpperCase().padStart(4, "0")}`)
        .join(" ")}
      )
    </p>
  ) : (
    <p className="be-invalid" role="status">
      无效：第 {decode.at} 个字节被拒绝（
      {DECODE_REASON_LABELS[decode.reason] ?? decode.reason}
      {decode.offendingByte !== undefined
        ? `；问题字节 0x${decode.offendingByte.toString(16).padStart(2, "0").toUpperCase()}`
        : ""}
      ）。
    </p>
  );
}

function FrameTrace({
  frames,
  selectedFrameIndex,
  onSelect,
}: {
  frames: readonly ByteEditFrame[];
  selectedFrameIndex?: number;
  onSelect: (index: number) => void;
}) {
  return (
    <section className="be-card" aria-label="字节编辑记录">
      <div className="be-card-heading">
        <div>
          <p className="eyebrow">编辑记录</p>
          <h3>编辑记录</h3>
        </div>
        <span>{frames.length} 次编辑</span>
      </div>
      {frames.length === 0 ? (
        <p>先编辑字节或加载样例</p>
      ) : (
        <ol className="be-trace-list">
          {frames.map((frame) => (
            <li key={frame.index}>
              <button
                aria-current={selectedFrameIndex === frame.index ? "true" : undefined}
                aria-label={`第 ${frame.index + 1} 次编辑，${frame.edit.kind === "byte" ? `第 ${frame.edit.byteIndex} 个字节改为 ${frame.edit.value}` : presetLabel(frame.edit.preset)}，${frame.decode.valid ? "有效" : "无效"}`}
                className={selectedFrameIndex === frame.index ? "is-selected" : ""}
                onClick={() => onSelect(frame.index)}
                type="button"
              >
                <strong>编辑 {frame.index + 1}</strong>
                <span>
                  {frame.edit.kind === "byte"
                    ? `第 ${frame.edit.byteIndex} 个字节 → ${frame.edit.value}`
                    : presetLabel(frame.edit.preset)}
                </span>
                <small>{frame.decode.valid ? "有效" : "无效"}</small>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function SelectedEvidence({ frame }: { frame?: ByteEditFrame }) {
  if (!frame) {
    return (
      <section className="be-card" aria-label="选中字节编辑结果">
        <p className="eyebrow">选中结果</p>
        <h3>应用一次编辑，检查结果</h3>
        <p>选中的编辑会显示编辑前后的字节，以及完整序列的解码结果。</p>
      </section>
    );
  }
  return (
    <section className="be-card" aria-label="选中字节编辑结果">
      <div className="be-card-heading">
        <div>
          <p className="eyebrow">选中结果</p>
          <h3>
            {frame.edit.kind === "byte"
              ? `第 ${frame.edit.byteIndex} 个字节 → ${frame.edit.value}`
              : presetLabel(frame.edit.preset)}
          </h3>
        </div>
        <span className="be-mono">{hexBytes(frame.after.bytes)}</span>
      </div>
      {frame.predictedValid !== undefined ? (
        <p role="status">
          预测：{frame.predictedValid ? "有效" : "无效"}；实际：
          {frame.decode.valid ? "有效" : "无效"}。
        </p>
      ) : null}
      <dl className="be-facts">
        <div>
          <dt>编辑前字节</dt>
          <dd className="be-mono">{hexBytes(frame.before.bytes)}</dd>
        </div>
        <div>
          <dt>编辑后字节</dt>
          <dd className="be-mono">{hexBytes(frame.after.bytes)}</dd>
        </div>
      </dl>
      <DecodeEvidence decode={frame.decode} />
      {frame.edit.kind === "preset" ? <p>解码器会判断这组字节序列是否有效。</p> : null}
    </section>
  );
}

function ByteEditContent({
  lesson,
  dispatch,
}: {
  lesson: ByteEditLessonState;
  dispatch: Dispatch<Parameters<typeof transitionByteEditLesson>[1]>;
}) {
  const selectedFrame = lesson.frames.find((frame) => frame.index === lesson.selectedFrameIndex);
  const scenario = getByteEditScenario(lesson.scenario);
  const option = scenarioOptions.find((candidate) => candidate.value === lesson.scenario)!;
  const currentDecode = useMemo(() => decodeUtf8(lesson.machine.bytes), [lesson.machine.bytes]);

  return (
    <div className="be-page">
      <header className="be-hero">
        <div>
          <p className="eyebrow">字节编辑</p>
          <h2>编辑 UTF-8 字节</h2>
          <p>修改 UTF-8 序列中的一个字节，或加载样例，查看解码结果。</p>
        </div>
        <div className="be-fixture-card" aria-label="字节编辑样例">
          <span>样例</span>
          <strong>{option.label}</strong>
          <small className="be-mono">{hexBytes(scenario.bytes)}</small>
        </div>
      </header>

      <div className="be-layout">
        <aside className="be-controls" aria-label="字节编辑控制">
          <section className="be-card">
            <p className="eyebrow">预测</p>
            <h3>编辑后序列的有效性</h3>
            <label htmlFor="be-prediction">有效性</label>
            <select
              id="be-prediction"
              onChange={(event) => dispatch({ type: "set-prediction", value: event.target.value })}
              value={lesson.predictionDraft}
            >
              <option value="">请选择</option>
              <option value="valid">仍有效</option>
              <option value="invalid">变为无效</option>
            </select>
            <p id="be-prediction-help">可先记录预测，再编辑。</p>
            <button
              className="be-secondary-button"
              onClick={() => dispatch({ type: "record-prediction" })}
              type="button"
            >
              记录预测
            </button>
            {lesson.predictionMessage ? <p role="status">预测已记录；编辑仍可继续。</p> : null}
          </section>

          <section className="be-card">
            <p className="eyebrow">编辑</p>
            <h3>修改一个字节</h3>
            <label htmlFor="be-index">字节索引</label>
            <select
              id="be-index"
              onChange={(event) => dispatch({ type: "set-edit-index", value: event.target.value })}
              value={lesson.editIndexDraft}
            >
              <option value="">请选择</option>
              {lesson.machine.bytes.map((value, index) => (
                <option key={index} value={index}>
                  {index}（当前为 {value}）
                </option>
              ))}
            </select>
            <label htmlFor="be-value">新值（0–255）</label>
            <input
              id="be-value"
              min={0}
              max={255}
              onChange={(event) => dispatch({ type: "set-edit-value", value: event.target.value })}
              type="number"
              value={lesson.editValueDraft}
            />
            <button
              className="be-primary-button"
              onClick={() => dispatch({ type: "apply-edit" })}
              type="button"
            >
              应用编辑
            </button>
          </section>

          <section className="be-card">
            <p className="eyebrow">预设样例</p>
            <h3>加载已知序列</h3>
            <div className="be-preset-grid">
              {Object.values(BYTE_EDIT_PRESETS).map((preset) => (
                <button
                  key={preset.id}
                  className="be-preset-button"
                  onClick={() => dispatch({ type: "apply-preset", preset: preset.id })}
                  type="button"
                >
                  {presetLabel(preset.id)}
                </button>
              ))}
            </div>
          </section>

          <section className="be-card">
            <p className="eyebrow">样例</p>
            <h3>选择文本</h3>
            <label htmlFor="be-scenario">字节编辑样例</label>
            <select
              id="be-scenario"
              onChange={(event) =>
                dispatch({
                  type: "set-scenario",
                  scenario: event.target.value as ByteEditScenarioId,
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
            <button
              className="be-reset-button"
              onClick={() => dispatch({ type: "reset" })}
              type="button"
            >
              恢复初始情境
            </button>
          </section>
        </aside>

        <div className="be-main-column">
          <section className="be-card be-status-card" aria-label="当前字节序列">
            <div>
              <p className="eyebrow">当前序列</p>
              <strong className="be-mono">{hexBytes(lesson.machine.bytes)}</strong>
            </div>
            <DecodeEvidence decode={currentDecode} />
          </section>
          <FrameTrace
            frames={lesson.frames}
            onSelect={(index) => dispatch({ type: "select-frame", index })}
            selectedFrameIndex={lesson.selectedFrameIndex}
          />
          <SelectedEvidence frame={selectedFrame} />
        </div>
      </div>
    </div>
  );
}

export function ByteEditPage() {
  const search = useSearch({ from: "/labs/byte-edit" }) as Record<string, unknown>;
  const scenario = useMemo(() => parseByteEditScenario(search), [search]);
  const [lesson, dispatch] = useReducer(
    transitionByteEditLesson,
    scenario,
    createByteEditLessonState,
  );

  useEffect(() => {
    dispatch({ type: "sync-url-scenario", scenario: scenario.scenario });
  }, [scenario.scenario]);

  return (
    <LabShell eyebrow="字节编辑" title="字节编辑" subtitle="一个字节改变含义">
      <ByteEditContent dispatch={dispatch} lesson={lesson} />
    </LabShell>
  );
}
