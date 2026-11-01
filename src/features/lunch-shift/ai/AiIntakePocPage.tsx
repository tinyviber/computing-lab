/**
 * 智能接单 PoC — dev-only proof of concept for the 「AI 接单 + 自动二次
 * 确认」 design. Everything runs in the browser: a pinned BGE embedding
 * model (vendored, self-hosted) proposes a ticket per order, the
 * student's need_confirm(similarity, margin) — run in the shared Pyodide
 * worker — decides when the simulated customer restates, and the fixed
 * parser reads the restatement. Nothing is saved or judged; the page's
 * job is to measure model accuracy and timing on real hardware.
 */

import { useEffect, useState } from "react";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { sameTicket, type Ticket } from "../domain/contracts.ts";
import { describeFullWidthPunctuation, friendlyRunError } from "../domain/runErrors.ts";
import { CodeEditor } from "../ui/CodeEditor.tsx";
import { runNeedConfirm, warmPyodide } from "../ui/pyodideRunner.ts";
import {
  AI_MODEL_ID,
  normalizedResults,
  POC_ORDERS,
  predictTicket,
  resolveOrder,
  textsToEmbed,
  type AiOrderOutcome,
  type Vector,
} from "../domain/aiIntake.ts";
import { embedTexts, loadEmbedder, type EmbedInfo, type EmbedProgress } from "../ui/embedRunner.ts";
import "./aiPoc.css";

const NEED_CONFIRM_STARTER = `def need_confirm(similarity, margin):
    if similarity < 0.85:
        return True
    if margin < 0.10:
        return True
    return False
`;

function ticketText(ticket: Ticket): string {
  return `${ticket.item || "?"} · 「${ticket.note}」 · ${ticket.table || "?"}号桌 · ${ticket.urgent ? "加急" : "普通"}`;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function fmt(score: number): string {
  return score.toFixed(3);
}

function OrderRow({ outcome }: { outcome: AiOrderOutcome }) {
  const { prediction } = outcome;
  const fields = [
    ["菜品", prediction.item],
    ["备注", prediction.note],
    ["桌号", prediction.table],
    ["时效", prediction.urgent],
  ] as const;
  return (
    <details className="ai-order">
      <summary>
        <b>{outcome.id}</b> · {outcome.request}
        <span className={outcome.correct ? "ai-mark ok" : "ai-mark bad"}>
          {outcome.correct ? "✓ 记对" : "✗ 记错"}
        </span>
      </summary>
      <div className="ai-order-body">
        <p>
          AI 猜：{ticketText(prediction.ticket)}（相似度 {fmt(prediction.similarity)}，差距{" "}
          {fmt(prediction.margin)}）
        </p>
        {outcome.confirmed ? (
          <p className="ai-confirm-line">
            触发二次确认（+{outcome.extraTicks} 拍）→ 顾客复述：{outcome.clarifyText}
          </p>
        ) : (
          <p className="ai-confirm-line">未触发二次确认，直接采用 AI 结果。</p>
        )}
        <p>
          最终小票：<b>{ticketText(outcome.ticket)}</b>
        </p>
        <table className="ai-field-table">
          <thead>
            <tr>
              <th>字段</th>
              <th>AI 选</th>
              <th>来源</th>
              <th>相似度</th>
              <th>与第二名差距</th>
              <th>候选得分</th>
            </tr>
          </thead>
          <tbody>
            {fields.map(([label, field]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>
                  {String(
                    field.value === true ? "加急" : field.value === false ? "普通" : field.value,
                  )}
                </td>
                <td>{field.source === "literal" ? "字面规则" : "向量"}</td>
                <td>{fmt(field.similarity)}</td>
                <td>{fmt(field.margin)}</td>
                <td>
                  <ul className="ai-score-list">
                    {field.scores.map((entry) => (
                      <li key={entry.value}>
                        {entry.value === "true"
                          ? "加急"
                          : entry.value === "false"
                            ? "普通"
                            : entry.value}
                        （{entry.prototype}）{fmt(entry.score)}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function AiIntakePocPage() {
  const [modelStatus, setModelStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [modelInfo, setModelInfo] = useState<EmbedInfo | null>(null);
  const [progress, setProgress] = useState<EmbedProgress | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [code, setCode] = useState(NEED_CONFIRM_STARTER);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<AiOrderOutcome[] | null>(null);
  const [timing, setTiming] = useState<{ embedMs: number; totalMs: number } | null>(null);

  useEffect(() => {
    warmPyodide();
    // Debug handle for offline scoring experiments (dev route only).
    (window as unknown as { __aiEmbed: typeof embedTexts }).__aiEmbed = embedTexts;
  }, []);

  const load = async () => {
    setModelStatus("loading");
    setModelError(null);
    setProgress(null);
    try {
      const info = await loadEmbedder(setProgress);
      setModelInfo(info);
      setModelStatus("ready");
    } catch (error) {
      setModelError(error instanceof Error ? error.message : String(error));
      setModelStatus("error");
    }
  };

  const run = async () => {
    setRunning(true);
    setRunError(null);
    setOutcomes(null);
    try {
      const punct = describeFullWidthPunctuation(code);
      if (punct) throw new Error(punct);
      const started = performance.now();
      const texts = textsToEmbed(POC_ORDERS.map((order) => order.request));
      const { vectors, ms: embedMs } = await embedTexts(texts);
      const embedOf = (text: string): Vector => vectors[texts.indexOf(text)];
      const predictions = POC_ORDERS.map((order) => predictTicket(order.request, embedOf));
      const cases: [number, number][] = predictions.map((prediction) => [
        round4(prediction.similarity),
        round4(prediction.margin),
      ]);
      const raw = await runNeedConfirm(code, cases);
      const confirms = Array.isArray(raw) ? raw : [];
      if (
        confirms.length !== POC_ORDERS.length ||
        confirms.some((value) => typeof value !== "boolean")
      ) {
        throw new Error("need_confirm 要对每张订单返回 True 或 False。");
      }
      setOutcomes(
        POC_ORDERS.map((order, index) => resolveOrder(order, predictions[index], confirms[index])),
      );
      setTiming({ embedMs, totalMs: Math.round(performance.now() - started) });
    } catch (error) {
      setRunError(friendlyRunError(error instanceof Error ? error.message : String(error)));
    } finally {
      setRunning(false);
    }
  };

  const expectedOf = (id: string) => POC_ORDERS.find((order) => order.id === id)?.expected;
  const predictedCorrect =
    outcomes?.filter((outcome) => {
      const expected = expectedOf(outcome.id);
      return expected != null && sameTicket(outcome.prediction.ticket, expected);
    }).length ?? 0;
  const finalCorrect = outcomes?.filter((outcome) => outcome.correct).length ?? 0;
  const confirmCount = outcomes?.filter((outcome) => outcome.confirmed).length ?? 0;

  return (
    <AppPageLayout
      className="ai-poc"
      topbarProps={{
        title: "智能接单 PoC",
        subtitle: "浏览器本地模型 · 不上服务器 · 不计成绩",
      }}
    >
      <main className="ai-poc-workspace">
        <section className="ai-card">
          <h2>1 · 加载模型</h2>
          <p>
            <code>{AI_MODEL_ID}</code>（量化版约 24 MB，文件在本机 vendor 目录）。优先 WebGPU
            用核显算，失败自动回退 WASM。
          </p>
          <div className="submit-row">
            <button
              className="button button-secondary"
              disabled={modelStatus === "loading" || modelStatus === "ready"}
              onClick={() => void load()}
              type="button"
            >
              {modelStatus === "loading"
                ? "加载中…"
                : modelStatus === "ready"
                  ? "已就绪"
                  : "加载模型"}
            </button>
            {modelInfo ? (
              <span className="submit-note">
                {modelInfo.device === "webgpu" ? "WebGPU（核显）" : "WASM（CPU）"} ·{" "}
                {modelInfo.dtype} · 加载 {modelInfo.loadMs} ms
              </span>
            ) : null}
          </div>
          {progress ? (
            <p className="submit-note">
              下载 {progress.file}：{Math.round(progress.loaded / 1024 / 1024)} /{" "}
              {Math.round(progress.total / 1024 / 1024)} MB
            </p>
          ) : null}
          {modelError ? (
            <p className="test-error" role="alert">
              {modelError}
              <br />
              模型文件在本机 vendor 目录里，先运行 <code>bun run sync:embed</code> 再重试。
            </p>
          ) : null}
        </section>

        <section className="ai-card">
          <h2>2 · 写 need_confirm，跑 12 张订单</h2>
          <p>
            AI 给每张订单记一张小票，并报告 <code>similarity</code>（最有把握字段的分）和{" "}
            <code>margin</code>
            （第一名领先第二名多少）。你的函数决定要不要让顾客再确认一遍，确认必得正确小票，但多花 1
            拍。
          </p>
          <CodeEditor
            ariaLabel="need_confirm 代码"
            disabled={running}
            onChange={setCode}
            value={code}
          />
          <div className="submit-row">
            <button
              className="button button-primary"
              disabled={modelStatus !== "ready" || running}
              onClick={() => void run()}
              type="button"
            >
              {running ? "推理中…" : "运行，看 12 张小票"}
            </button>
            {timing ? (
              <span className="submit-note">
                向量计算 {timing.embedMs} ms · 全流程 {timing.totalMs} ms
              </span>
            ) : null}
          </div>
          {runError ? (
            <p className="test-error" role="alert">
              {runError}
            </p>
          ) : null}
        </section>

        {outcomes ? (
          <section className="ai-card">
            <h2>3 · 结果</h2>
            <p className="ai-summary">
              AI 直接记对 <b>{predictedCorrect}</b> / {POC_ORDERS.length} · 二次确认{" "}
              <b>{confirmCount}</b> 次（额外 {confirmCount} 拍）· 最终记对 <b>{finalCorrect}</b> /{" "}
              {POC_ORDERS.length}
            </p>
            <div className="ai-order-list">
              {outcomes.map((outcome) => (
                <OrderRow key={outcome.id} outcome={outcome} />
              ))}
            </div>
            <h3>标准化提交（服务器会收到的样子）</h3>
            <pre className="ai-json">
              {JSON.stringify(normalizedResults("intake-poc-v1", outcomes), null, 2)}
            </pre>
          </section>
        ) : null}
      </main>
    </AppPageLayout>
  );
}
