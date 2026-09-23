/**
 * Teacher review drawer: one student's full response with per-question score
 * overrides and comments. Teachers see the complete schema (accepted answers,
 * correct options, reference answers) — this component is never mounted for
 * students.
 */

import { useState } from "react";
import { api, describeApiError } from "../../../shared/api/client";
import { Icon } from "../../../shared/ui/Icon";
import { splitPromptBlanks, type SheetSchema, type Question } from "../domain/schema";
import type { QuestionGrading } from "../domain/grade";
import type { ResponseDetail } from "./TaskDashboard";

function AnswerView({
  q,
  answer,
  grading,
}: {
  q: Question;
  answer: ResponseDetail["answers"][string] | undefined;
  grading: QuestionGrading | undefined;
}) {
  if (q.type === "fill") {
    const segments = splitPromptBlanks(q.prompt);
    const hasCloze = segments.some((s) => s.type === "blank");
    const blankText = (id: string) => (answer?.type === "fill" ? (answer.blanks?.[id] ?? "") : "");
    return (
      <>
        {hasCloze ? (
          <p className="ts-cloze ts-cloze-review">
            {segments.map((seg, i) => {
              if (seg.type === "text") return <span key={i}>{seg.text}</span>;
              const blank = q.blanks[seg.index];
              if (!blank) return null;
              const g = grading?.type === "fill" ? grading.blanks[blank.id] : undefined;
              return (
                <span
                  className={`ts-cloze-fill${g ? (g.correct ? " is-right" : " is-wrong") : ""}`}
                  key={blank.id}
                >
                  {g?.answer?.trim() ? g.answer : "未作答"}
                </span>
              );
            })}
          </p>
        ) : null}
        <ul className="ts-review-answers">
          {q.blanks.map((blank, i) => {
            const g = grading?.type === "fill" ? grading.blanks[blank.id] : undefined;
            return (
              <li key={blank.id}>
                <span className="q-label">空 {i + 1}</span>{" "}
                <span className={g?.correct ? "is-right" : "is-wrong"}>
                  {blankText(blank.id).trim() ? blankText(blank.id) : <em>未作答</em>}
                </span>{" "}
                {g ? <Icon name={g.correct ? "check" : "x"} size={12} /> : null}
                <span className="ts-stat-detail">答案：{blank.accept.join(" / ")}</span>
              </li>
            );
          })}
        </ul>
      </>
    );
  }
  if (q.type === "choice") {
    const selected = new Set(answer?.type === "choice" ? answer.optionIds : []);
    const correct = new Set(q.correctOptionIds);
    return (
      <ul className="ts-review-answers">
        {q.options.map((opt) => (
          <li key={opt.id}>
            <span className={`ts-pick-dot${selected.has(opt.id) ? " is-picked" : ""}`} />
            <span className={selected.has(opt.id) ? "is-picked" : ""}>{opt.text}</span>
            {correct.has(opt.id) ? (
              <span className="ts-stat-detail">
                {" "}
                <Icon name="check" size={11} /> 正确
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <>
      <p className="ts-review-short">
        {answer?.type === "short" && (answer.text ?? "").trim() !== "" ? (
          answer.text
        ) : (
          <em>未作答</em>
        )}
      </p>
      {q.referenceAnswer ? <p className="ts-stat-detail">参考答案:{q.referenceAnswer}</p> : null}
    </>
  );
}

export function TaskReviewDrawer({
  classId,
  assignmentId,
  response,
  schema,
  onClose,
}: {
  classId: string;
  assignmentId: string;
  response: ResponseDetail;
  schema: SheetSchema;
  onClose: (changed: boolean) => void;
}) {
  const [scores, setScores] = useState<Record<string, number | undefined>>(() => {
    const initial: Record<string, number | undefined> = {};
    for (const q of schema.questions) {
      const existing = response.review.questions[q.id]?.score;
      if (typeof existing === "number") {
        initial[q.id] = existing;
      } else if (q.type !== "short") {
        initial[q.id] = response.grading?.[q.id]?.score ?? undefined;
      }
    }
    return initial;
  });
  const [comments, setComments] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      schema.questions
        .map((q) => [q.id, response.review.questions[q.id]?.comment ?? ""])
        .filter(([, v]) => v !== ""),
    ),
  );
  const [overall, setOverall] = useState(response.review.comment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitted = response.status === "submitted" || response.status === "reviewed";
  const total = schema.questions.reduce(
    (sum, q) => sum + (q.type === "short" ? q.maxScore : q.score),
    0,
  );
  const previewScore = schema.questions.reduce((sum, q) => {
    const override = scores[q.id];
    if (typeof override === "number")
      return sum + Math.max(0, Math.min(override, q.type === "short" ? q.maxScore : q.score));
    if (q.type === "short") return sum;
    return sum + (response.grading?.[q.id]?.score ?? 0);
  }, 0);

  const save = () => {
    setBusy(true);
    setError(null);
    void api
      .patch(
        `/api/classes/${classId}/task-assignments/${assignmentId}/responses/${response.id}/review`,
        {
          questions: Object.fromEntries(
            schema.questions.map((q) => [
              q.id,
              {
                ...(scores[q.id] !== undefined ? { score: scores[q.id] } : {}),
                ...(comments[q.id] ? { comment: comments[q.id] } : {}),
              },
            ]),
          ),
          comment: overall || undefined,
        },
      )
      .then(() => onClose(true))
      .catch((caught) => {
        setError(describeApiError(caught));
        setBusy(false);
      });
  };

  const sendBack = () => {
    if (!window.confirm("退回这份答卷？学生可以修改后重新提交。")) return;
    setBusy(true);
    void api
      .post(
        `/api/classes/${classId}/task-assignments/${assignmentId}/responses/${response.id}/return`,
      )
      .then(() => onClose(true))
      .catch((caught) => {
        setError(describeApiError(caught));
        setBusy(false);
      });
  };

  return (
    <div className="drawer-scrim" role="presentation" onClick={() => onClose(false)}>
      <aside
        aria-label="答卷详情"
        className="drawer"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <p className="eyebrow">
            {response.studentNo} {response.name}
          </p>
          <h2>
            答卷 · {Math.round(previewScore * 100) / 100} / {total}
          </h2>
          <button
            aria-label="关闭详情"
            className="drawer-close"
            onClick={() => onClose(false)}
            type="button"
          >
            <Icon name="x" size={16} />
          </button>
        </header>

        {schema.questions.map((q, i) => {
          const grading = response.grading?.[q.id];
          const max = q.type === "short" ? q.maxScore : q.score;
          return (
            <section className="ts-review-q" key={q.id}>
              <p className="ts-review-q-head">
                <span className="q-label">Q{i + 1}</span>
                <span>{q.prompt}</span>
                <span className="ts-answer-max">{max} 分</span>
              </p>
              <AnswerView answer={response.answers[q.id]} grading={grading} q={q} />
              <div className="ts-review-score">
                <input
                  aria-label={`第 ${i + 1} 题得分`}
                  max={max}
                  min={0}
                  onChange={(e) =>
                    setScores((s) => ({
                      ...s,
                      [q.id]: e.target.value === "" ? undefined : Number(e.target.value),
                    }))
                  }
                  placeholder={q.type === "short" ? "打分" : undefined}
                  step={0.5}
                  type="number"
                  value={scores[q.id] ?? ""}
                />
                <span>
                  / {max} 分{q.type !== "short" && grading ? `（自动 ${grading.score}）` : ""}
                </span>
              </div>
              <input
                aria-label={`第 ${i + 1} 题评语`}
                className="ts-review-comment"
                onChange={(e) => setComments((c) => ({ ...c, [q.id]: e.target.value }))}
                placeholder="本题评语（可选）"
                value={comments[q.id] ?? ""}
              />
            </section>
          );
        })}

        <label className="ts-field">
          <span>整体评语</span>
          <textarea
            className="ts-review-comment"
            onChange={(e) => setOverall(e.target.value)}
            rows={2}
            value={overall}
          />
        </label>

        {error ? (
          <p className="test-error" role="alert">
            {error}
          </p>
        ) : null}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="button button-primary"
            disabled={busy || !submitted}
            onClick={save}
            type="button"
          >
            保存批改
          </button>
          <button
            className="button button-secondary"
            disabled={busy || !submitted}
            onClick={sendBack}
            type="button"
          >
            退回重做
          </button>
        </div>
      </aside>
    </div>
  );
}
