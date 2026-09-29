/**
 * 解码侦探 lab page: raw data on the left, the student's decoder in the
 * middle, the decoded artifact on the right — the lab's whole claim is that
 * "数据 + 约定 = 信息", so every stage ends with a visible artifact.
 *
 * The student only ever submits data (the decoded artifact + their code
 * snapshot for the teacher); the server re-derives the per-user payload and
 * checks the artifact against a reference decode. Student Python runs only
 * in the browser's Pyodide worker.
 */

import { useParams, useSearch } from "@tanstack/react-router";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { indentUnit } from "@codemirror/language";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api, describeApiError } from "../../../shared/api/client";
import { useAuth } from "../../../shared/auth";
import { LabAccessGate, SaveIndicator } from "../../../shared/lab/LabGate";
import { useLabCatalog } from "../../../shared/lab/labs";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { useLabProject } from "../../../shared/lab/useLabProject";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { Icon } from "../../../shared/ui/Icon";
import type { PixelMatrix } from "../domain/bmp.ts";
import { CHAR_TABLE } from "../domain/encoding.ts";
import { catPixels } from "../domain/sprites.ts";
import type {
  DecodingDraft,
  DecodingJudgeResult,
  DecodingSubmission,
  LabPayload,
} from "../domain/protocol.ts";
import { decodingStageUnlocked, type DecodingStageDef } from "../domain/stages.ts";
import { sanitizePixels, sanitizeText } from "../domain/verify.ts";
import {
  allPromptsAnswered,
  answeredPromptIds,
  createDecodingLessonState,
  draftOf,
  isStageUnlocked,
  stageOf,
  transitionDecodingLesson,
  type DecodingLessonAction,
} from "../lesson/state.ts";
import { BytePanel } from "./BytePanel.tsx";
import { ConceptPanel } from "./ConceptPanel.tsx";
import { DecodingStageRail } from "./DecodingStageRail.tsx";
import { FilesPanel } from "./FilesPanel.tsx";
import { PixelCanvas } from "./PixelCanvas.tsx";
import { BMP_HELPER, runDecode, warmPyodide } from "./pyodideRunner.ts";
import "./decoding.css";

const EDITOR_EXTENSIONS = [python(), indentUnit.of("    "), keymap.of([indentWithTab])];

/** Every BMP stage decodes the same fixed cat — the visible decode target. */
const TARGET_PIXELS = catPixels();

/** The value the student's `decode(data)` receives for this stage. */
function runData(payload: LabPayload): unknown {
  switch (payload.kind) {
    case "codes":
      return payload.codes;
    case "bits":
      return payload.groups;
    case "bmp":
      return payload.bytes;
    case "files":
      return null;
  }
}

type RunResult = { text: string } | { pixels: PixelMatrix } | null;

function StageBrief({ stage, passed }: { stage: DecodingStageDef; passed: boolean }) {
  return (
    <section className="stage-brief">
      <p className="stage-mission">{stage.mission}</p>
      {stage.description ? <p>{stage.description}</p> : null}
      <p className="stage-task">{stage.task}</p>
      <p className="submit-note">{stage.judgeNote}</p>
      {passed ? <p className="stage-takeaway">本关收获：{stage.takeaway}</p> : null}
      {stage.hint ? (
        <details className="stage-details">
          <summary>提示</summary>
          <p>{stage.hint}</p>
        </details>
      ) : null}
    </section>
  );
}

function DecodeEditor({
  stage,
  code,
  running,
  onCodeChange,
  onRun,
  onPrintExample,
}: {
  stage: DecodingStageDef;
  code: string;
  running: boolean;
  onCodeChange: (code: string) => void;
  onRun: () => void;
  onPrintExample: () => void;
}) {
  return (
    <section aria-label="解码器" className="decode-editor">
      <div className="decoding-panel-heading">
        <h3>你的解码器</h3>
      </div>
      <p className="decoding-panel-note decode-editor-note">
        写一个 <code>decode(data)</code>，返回对原始数据的解码结果。
      </p>
      {stage.example ? (
        <aside aria-label="样例输入" className="decode-example">
          <div className="decode-example-heading">
            <h4>样例输入</h4>
            {stage.example.run ? (
              <button
                aria-label="运行样例并打印 data"
                className="decode-example-play"
                disabled={running}
                onClick={onPrintExample}
                title="打印 data"
                type="button"
              >
                ▶
              </button>
            ) : null}
          </div>
          <pre>
            <code>{stage.example.input}</code>
          </pre>
        </aside>
      ) : null}
      <CodeMirror
        aria-label="decode 代码"
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          autocompletion: false,
        }}
        className="code-editor"
        extensions={EDITOR_EXTENSIONS}
        height="220px"
        onChange={onCodeChange}
        theme="dark"
        value={code}
      />
      <div className="guided-actions">
        <button
          className="button button-secondary"
          disabled={running}
          onClick={onRun}
          type="button"
        >
          {running ? "运行中…" : "运行 decode"}
        </button>
        {stage.kind === "bmp-script" ? (
          <span className="helper-note-inline">
            已提供 <code>decode_bmp(data)</code> 可直接调用。
          </span>
        ) : null}
      </div>
    </section>
  );
}

function TextResult({ text, stage }: { text: string; stage: DecodingStageDef }) {
  const table = CHAR_TABLE;
  const codes = [...text].map((ch) => ch.charCodeAt(0));
  return (
    <div className="run-result">
      <p className="run-result-label">decode(data) →</p>
      <p className="decoded-text">{text || "（空串）"}</p>
      {stage.kind === "codes" || stage.kind === "bits" ? (
        <ol className="decoded-map">
          {codes.slice(0, 24).map((code, i) => (
            <li key={i}>
              <span className="decoded-code">
                {stage.kind === "bits" ? code.toString(2).padStart(8, "0") : code}
              </span>
              <span className="decoded-arrow">→</span>
              <span className="decoded-char">{text[i]}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {stage.kind === "codes" ? (
        <p className="decoded-count">每个数字都按编码表对上了字符（空格={table[0].code}）。</p>
      ) : null}
    </div>
  );
}

export function DecodingLabPage() {
  const { classId } = useParams({ from: "/classes/$classId/labs/decoding" });
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const { status, role } = useAuth();
  const catalog = useLabCatalog(status === "authenticated");
  const [state, dispatch] = useReducer(transitionDecodingLesson, undefined, () =>
    createDecodingLessonState(1),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<RunResult>(null);
  const [samplePrintout, setSamplePrintout] = useState<string | null>(null);
  const [samplePrintError, setSamplePrintError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PixelMatrix | null>(null);
  const [wrongPick, setWrongPick] = useState<{ promptId: string; option: number } | null>(null);

  const stage = stageOf(state);
  const draft = draftOf(state);
  const payload = state.payloads[state.stageIndex];

  useEffect(() => warmPyodide(), []);

  const { projectLoaded, loadError } = useLabProject<
    DecodingDraft,
    { payloads: Record<number, LabPayload> },
    DecodingLessonAction
  >({
    classId,
    labId: "decoding",
    ready: status === "authenticated",
    toAction: (project) => ({
      type: "load-project",
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      drafts: Object.fromEntries(
        Object.entries(project.drafts ?? {}).map(([key, value]) => [Number(key), value]),
      ),
      payloads: project.payloads ?? {},
    }),
    dispatch,
  });

  useAutosaveDraft<DecodingDraft>({
    classId,
    labId: "decoding",
    saveStatus: state.saveStatus,
    stageIndex: state.stageIndex,
    draftOf: (index) => draftOf(state, index),
    deps: [state.drafts],
    onSaving: () => dispatch({ type: "mark-saving" }),
    onSaved: () => dispatch({ type: "mark-saved" }),
    onError: () => dispatch({ type: "mark-save-error" }),
  });

  // Switching stage drops the working result — each stage's artifact is its own.
  useEffect(() => {
    setLastRun(null);
    setSamplePrintout(null);
    setSamplePrintError(null);
    setPreview(null);
    setRunError(null);
    setWrongPick(null);
  }, [state.stageIndex]);

  // A shared ?stage=N link opens that stage once, after the project loads
  // (locked or out-of-range targets fall through to the saved position).
  const stageLinkApplied = useRef(false);
  useEffect(() => {
    if (stageLinkApplied.current || !projectLoaded) return;
    stageLinkApplied.current = true;
    const wanted = Number(search.stage);
    if (Number.isInteger(wanted) && isStageUnlocked(state, wanted)) {
      dispatch({ type: "select-stage", stageIndex: wanted });
    }
  }, [projectLoaded]);

  const source = draft.code.trim() ? draft.code : (stage?.starterCode ?? "");

  const run = useCallback(async () => {
    if (!stage || !payload || payload.kind === "files") return;
    setRunning(true);
    setRunError(null);
    setLastRun(null);
    try {
      const preamble = stage.kind === "bmp-script" ? BMP_HELPER : undefined;
      const result = await runDecode(source, runData(payload), { preamble });
      if (stage.kind === "bmp") {
        const pixels = sanitizePixels(result);
        if (!pixels)
          throw new Error("decode 要返回像素二维列表：pixels[y][x] = [R, G, B]，每个分量 0～255。");
        setLastRun({ pixels });
      } else {
        const text = sanitizeText(result);
        if (!text) throw new Error("decode 要返回一个字符串（1～200 个字符）。");
        setLastRun({ text });
      }
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }, [stage, payload, source]);

  const runPreview = useCallback(async () => {
    if (!payload || payload.kind !== "bmp" || stage?.kind !== "bmp-script") return;
    setRunning(true);
    setRunError(null);
    try {
      const pixels = await runDecode("", runData(payload), {
        preamble: BMP_HELPER,
        call: "decode_bmp(data)",
      });
      const clean = sanitizePixels(pixels);
      if (!clean) throw new Error("预览解码没有得到合法的像素列表。");
      setPreview(clean);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }, [payload, stage]);

  const printExampleData = useCallback(async () => {
    if (!stage?.example?.run) return;
    setRunning(true);
    setSamplePrintout(null);
    setSamplePrintError(null);
    try {
      const result = await runDecode(stage.example.input, null, {
        call: "None",
        captureStdout: true,
        useCodeData: true,
      });
      if (typeof result !== "object" || result === null || !("stdout" in result)) {
        throw new Error("没有捕获到 print 输出。");
      }
      setSamplePrintout(String(result.stdout));
    } catch (error) {
      setSamplePrintError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }, [stage]);

  /** What blocks the 提交判定 button, as a student-readable reason. */
  const submitBlocker = (): string | null => {
    if (!stage || !payload) return "数据还没载入，稍等。";
    if (!allPromptsAnswered(state)) return "概念题还没答完。";
    switch (stage.kind) {
      case "files":
        return payload.kind === "files" &&
          draft.verdicts.filter(Boolean).length === payload.files.length
          ? null
          : "每个文件都要先给出判定。";
      case "bmp":
        if (!lastRun || !("pixels" in lastRun)) return "先运行你的 decode，得到像素结果。";
        return null;
      default:
        return lastRun && "text" in lastRun ? null : "先运行你的 decode，得到解码结果。";
    }
  };

  const onSubmit = useCallback(async () => {
    if (!classId || !stage || !payload) return;
    const blocker = submitBlocker();
    if (blocker) {
      dispatch({ type: "message", text: blocker });
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const artifact =
        stage.kind === "files"
          ? { verdicts: draft.verdicts }
          : stage.kind === "bmp"
            ? {
                pixels: lastRun && "pixels" in lastRun ? lastRun.pixels : [],
              }
            : { text: lastRun && "text" in lastRun ? lastRun.text : "" };
      const submission: DecodingSubmission = {
        stageIndex: stage.index,
        artifact,
        code: draft.code || undefined,
        conceptAnswers:
          stage.prompts && stage.prompts.length > 0 ? draft.conceptAnswers : undefined,
      };
      const outcome = await api.post<DecodingJudgeResult>(
        `/api/classes/${classId}/labs/decoding/judge`,
        submission,
      );
      dispatch({ type: "judge-result", outcome });
      if (!outcome.passed) {
        dispatch({ type: "message", text: "判定未通过——看看右侧每一项的检查结果。" });
      }
    } catch (error) {
      setSubmitError(describeApiError(error));
    } finally {
      setSubmitting(false);
    }
  }, [classId, stage, payload, state, draft, lastRun]);

  const blocker = stage ? submitBlocker() : null;

  return (
    <LabAccessGate
      classId={classId}
      hidden={catalog?.get("decoding")?.hidden === true}
      labName="解码侦探"
      role={role}
      status={status}
    >
      <AppPageLayout
        className="decoding-lab"
        topbar={<SaveIndicator status={state.saveStatus} />}
        topbarProps={{
          subtitle: stage?.englishTitle,
          title: stage ? `${String(stage.index).padStart(2, "0")} ${stage.title}` : "解码侦探",
        }}
      >
        <div className="page-content decoding-layout">
          <DecodingStageRail
            onSelect={(index) => dispatch({ type: "select-stage", stageIndex: index })}
            passedStages={state.passedStages}
            stageIndex={state.stageIndex}
            unlocked={(s) => decodingStageUnlocked(state.passedStages, s.index)}
          />

          <main aria-label="解码实验区" className="decoding-workspace">
            {stage ? (
              <StageBrief passed={state.passedStages.includes(stage.index)} stage={stage} />
            ) : null}

            {state.message ? (
              <p className="test-error" role="alert">
                {state.message}
                <button onClick={() => dispatch({ type: "dismiss-message" })} type="button">
                  <Icon name="x" size={12} />
                </button>
              </p>
            ) : null}
            {(loadError ?? submitError) ? (
              <p className="test-error" role="alert">
                {loadError ?? submitError}
              </p>
            ) : null}

            {stage && payload ? (
              <>
                {payload.kind === "files" ? (
                  <FilesPanel
                    onVerdict={(fileIndex, verdict) =>
                      dispatch({ type: "set-verdict", fileIndex, verdict })
                    }
                    payload={payload}
                    verdicts={draft.verdicts}
                  />
                ) : (
                  <div className="decoder-console">
                    <BytePanel key={payload.kind} payload={payload} />
                    <DecodeEditor
                      code={source}
                      onCodeChange={(code) => dispatch({ type: "set-code", code })}
                      onPrintExample={() => void printExampleData()}
                      onRun={() => void run()}
                      running={running}
                      stage={stage}
                    />
                    <section aria-label="解码结果" className="decode-output">
                      <div className="decoding-panel-heading">
                        <h3>解码结果</h3>
                        {stage.kind === "bmp-script" ? (
                          <button
                            className="button button-ghost"
                            disabled={running}
                            onClick={() => void runPreview()}
                            type="button"
                          >
                            先预览这张图
                          </button>
                        ) : null}
                      </div>
                      {stage.example ? (
                        <div className="decode-example-output">
                          <h4>样例输出</h4>
                          <pre>
                            <code>
                              {samplePrintout ?? stage.example.output ?? "运行样例后显示"}
                            </code>
                          </pre>
                          {samplePrintError ? (
                            <p className="decode-example-error" role="alert">
                              {samplePrintError}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {runError ? (
                        <pre className="python-error" role="alert">
                          {runError}
                        </pre>
                      ) : null}
                      {preview ? (
                        <div className="preview-block">
                          <PixelCanvas ariaLabel="图片预览" pixels={preview} />
                          <p className="preview-note">
                            按 BMP 约定读是一张正常图片——但传入的数值里似乎不只是颜色。
                          </p>
                        </div>
                      ) : null}
                      {lastRun && "text" in lastRun ? (
                        <TextResult stage={stage} text={lastRun.text} />
                      ) : null}
                      {stage.kind === "bmp" ? (
                        <div className="pixel-compare">
                          <figure>
                            <PixelCanvas ariaLabel="目标图案" pixels={TARGET_PIXELS} />
                            <figcaption>目标图案</figcaption>
                          </figure>
                          <figure>
                            {lastRun && "pixels" in lastRun ? (
                              <PixelCanvas ariaLabel="你的解码结果" pixels={lastRun.pixels} />
                            ) : (
                              <div className="pixel-compare-empty">?</div>
                            )}
                            <figcaption>你的解码结果</figcaption>
                          </figure>
                        </div>
                      ) : null}
                      {!lastRun && !runError && !preview && stage.kind !== "bmp" ? (
                        <p className="output-empty">运行 decode 后，结果会出现在这里。</p>
                      ) : null}
                    </section>
                  </div>
                )}

                <ConceptPanel
                  answered={answeredPromptIds(state)}
                  onAnswer={(promptId, option) => {
                    setWrongPick(null);
                    dispatch({ type: "answer-prompt", promptId, option });
                    // answer-prompt only records correct picks — a miss is the wrong pick.
                    const prompt = stage.prompts?.find((p) => p.id === promptId);
                    if (prompt && !prompt.options[option]?.correct) {
                      setWrongPick({ promptId, option });
                    }
                  }}
                  stage={stage}
                  wrongPick={wrongPick}
                />

                <div className="submit-row">
                  <button
                    className="button button-primary"
                    disabled={submitting || blocker !== null}
                    onClick={() => void onSubmit()}
                    type="button"
                  >
                    {submitting ? "判定中…" : "提交判定"}
                  </button>
                  <span className="submit-note">
                    {blocker ?? "提交你还原出的结果，由服务器判定。"}
                  </span>
                </div>

                {state.judgeOutcome ? (
                  <section
                    aria-label="判定结果"
                    className={`judge-result${state.judgeOutcome.passed ? " is-passed" : ""}`}
                  >
                    <h3>{state.judgeOutcome.passed ? "判定通过 ✓" : "判定未通过"}</h3>
                    <ol>
                      {state.judgeOutcome.parts.map((part) => (
                        <li className={part.ok ? "is-ok" : "is-bad"} key={part.id}>
                          <strong>{part.label}</strong>
                          <span>{part.detail}</span>
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}
              </>
            ) : null}
          </main>
        </div>
      </AppPageLayout>
    </LabAccessGate>
  );
}
