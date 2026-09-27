/**
 * ProbeConsole — C1's question bench: pick one of the assigned questions,
 * fire 「连问 N 次」, collect answers into the transcript. Draws are
 * server-dispatched; the console only ever sees payloads.
 */

import { useState } from "react";
import { MAX_REPEAT } from "../domain/probe.ts";
import type { AiEvalQuestionBrief, DrawPayload } from "../domain/protocol.ts";

export function ProbeConsole(props: {
  questions: AiEvalQuestionBrief[];
  /** drawId → payload cache, for counts and rendering. */
  issuedCount: (questionId: string) => number;
  drawsFor: (questionId: string) => DrawPayload[];
  onDraw: (questionId: string, count: number) => void;
  onCollect: (drawId: string, collect: boolean) => void;
  collectedIds: Set<string>;
  busy: boolean;
  renderDraw: (draw: DrawPayload, collected: boolean) => React.ReactNode;
}) {
  const { questions, issuedCount, drawsFor, onDraw, busy, renderDraw } = props;
  const [selected, setSelected] = useState(0);
  const [count, setCount] = useState(3);

  const question = questions[Math.min(selected, Math.max(0, questions.length - 1))];

  return (
    <section aria-label="提问台" className="ae-panel">
      <p className="eyebrow">提问台</p>
      <div className="ae-row">
        <label>
          题目
          <select onChange={(e) => setSelected(Number(e.target.value))} value={selected}>
            {questions.map((q, i) => (
              <option key={q.id} value={i}>
                {q.text}
              </option>
            ))}
          </select>
        </label>
        <label>
          连问
          <input
            max={MAX_REPEAT}
            min={1}
            onChange={(e) => setCount(Math.max(1, Math.min(MAX_REPEAT, Number(e.target.value))))}
            style={{ width: "3.5em" }}
            type="number"
            value={count}
          />
          次
        </label>
        <button
          className="button button-secondary"
          disabled={busy || !question || issuedCount(question.id) >= MAX_REPEAT}
          onClick={() => question && onDraw(question.id, count)}
          type="button"
        >
          {busy ? "生成中…" : "连问"}
        </button>
        {question ? (
          <span className="ae-hint">
            本题已生成 {issuedCount(question.id)}/{MAX_REPEAT} 条
          </span>
        ) : null}
      </div>
      {question
        ? drawsFor(question.id).map((d) => (
            <div key={d.drawId}>{renderDraw(d, props.collectedIds.has(d.drawId))}</div>
          ))
        : null}
    </section>
  );
}
