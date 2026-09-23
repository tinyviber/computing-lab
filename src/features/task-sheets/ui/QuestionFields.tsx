/**
 * Read-only/writeable rendering of the three question types. Shared by the
 * student fill page (editable) and the teacher review drawer (read-only with
 * grading overlays). Never renders answer keys — it receives publicSchema
 * questions from the student path, and the teacher path hides correctOptionIds
 * behind an explicit `showAnswers` flag.
 */

import { Icon } from "../../../shared/ui/Icon";
import type { AnswerValue } from "../domain/grade";
import { splitPromptBlanks, type PublicQuestion } from "../domain/schema";

export type PublicGrading = {
  type: string;
  score: number | null;
  max: number;
  correct?: boolean;
  selected?: string[];
  blanks?: Record<string, { correct: boolean }>;
};

function fillGrading(g: PublicGrading | undefined) {
  return g?.type === "fill" ? g : undefined;
}
function choiceGrading(g: PublicGrading | undefined) {
  return g?.type === "choice" ? g : undefined;
}

export function QuestionAnswer({
  q,
  index,
  value,
  onChange,
  grading,
  review,
  readOnly,
}: {
  q: PublicQuestion;
  index: number;
  value: AnswerValue | undefined;
  onChange?: (v: AnswerValue) => void;
  grading?: PublicGrading;
  review?: { score?: number; comment?: string };
  readOnly?: boolean;
}) {
  const max = q.type === "short" ? q.maxScore : q.score;
  const shownScore = review?.score ?? grading?.score;
  const hasScore = grading !== undefined || review?.score !== undefined;
  const cloze = q.type === "fill" ? splitPromptBlanks(q.prompt) : null;
  const hasCloze = cloze !== null && cloze.some((s) => s.type === "blank");
  return (
    <section className="ts-answer-card" aria-label={`第 ${index + 1} 题`}>
      <header className="ts-answer-head">
        <span className="ts-card-index">Q{index + 1}</span>
        <p className="ts-answer-prompt">
          {hasCloze ? "" : q.prompt}
          {q.required ? <span className="ts-required"> *</span> : null}
        </p>
        <span className="ts-answer-max">{max} 分</span>
        {hasScore ? (
          <span
            className={`ts-answer-score${shownScore !== null && shownScore !== undefined && shownScore >= max ? " is-full" : ""}`}
          >
            {shownScore ?? "待批"}/{max}
          </span>
        ) : null}
      </header>

      {q.type === "fill" && hasCloze ? (
        <p className="ts-cloze">
          {cloze.map((seg, i) => {
            if (seg.type === "text") return <span key={i}>{seg.text}</span>;
            const blank = q.blanks[seg.index];
            if (!blank) return null;
            const mark = fillGrading(grading)?.blanks?.[blank.id];
            return (
              <span className="ts-cloze-slot" key={blank.id}>
                <input
                  aria-label={`空 ${seg.index + 1}`}
                  className={`ts-blank-inline${mark ? (mark.correct ? " is-right" : " is-wrong") : ""}`}
                  disabled={readOnly}
                  onChange={(e) =>
                    onChange?.({
                      type: "fill",
                      blanks: {
                        ...(value?.type === "fill" ? value.blanks : {}),
                        [blank.id]: e.target.value,
                      },
                    })
                  }
                  value={value?.type === "fill" ? (value.blanks[blank.id] ?? "") : ""}
                />
                {mark ? (
                  <span className={`ts-blank-mark${mark.correct ? " is-right" : " is-wrong"}`}>
                    <Icon name={mark.correct ? "check" : "x"} size={12} />
                  </span>
                ) : null}
              </span>
            );
          })}
        </p>
      ) : null}

      {q.type === "fill" && !hasCloze ? (
        <div className="ts-answer-blanks">
          {q.blanks.map((blank, i) => {
            const mark = fillGrading(grading)?.blanks?.[blank.id];
            return (
              <label
                className={`ts-answer-blank${mark ? (mark.correct ? " is-right" : " is-wrong") : ""}`}
                key={blank.id}
              >
                <span>空 {i + 1}</span>
                <input
                  disabled={readOnly}
                  onChange={(e) =>
                    onChange?.({
                      type: "fill",
                      blanks: {
                        ...(value?.type === "fill" ? value.blanks : {}),
                        [blank.id]: e.target.value,
                      },
                    })
                  }
                  value={value?.type === "fill" ? (value.blanks[blank.id] ?? "") : ""}
                />
                {mark ? (
                  <span className={`ts-blank-mark${mark.correct ? " is-right" : " is-wrong"}`}>
                    <Icon name={mark.correct ? "check" : "x"} size={13} />
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      ) : null}

      {q.type === "choice" ? (
        <div className="ts-answer-options">
          {q.options.map((opt) => {
            const selected = value?.type === "choice" ? value.optionIds.includes(opt.id) : false;
            return (
              <label className={`ts-answer-option${selected ? " is-selected" : ""}`} key={opt.id}>
                <input
                  checked={selected}
                  disabled={readOnly}
                  name={q.multiple ? undefined : `ans-${q.id}`}
                  onChange={(e) => {
                    const current = value?.type === "choice" ? value.optionIds : [];
                    const next = q.multiple
                      ? e.target.checked
                        ? [...current, opt.id]
                        : current.filter((id) => id !== opt.id)
                      : [opt.id];
                    onChange?.({ type: "choice", optionIds: next });
                  }}
                  type={q.multiple ? "checkbox" : "radio"}
                />
                <span>{opt.text}</span>
              </label>
            );
          })}
          {q.multiple ? <p className="ts-hint">多选题</p> : null}
          {choiceGrading(grading)?.correct === false ? (
            <p className="ts-hint ts-wrong">答案不正确</p>
          ) : null}
        </div>
      ) : null}

      {q.type === "short" ? (
        <textarea
          aria-label={`第 ${index + 1} 题作答`}
          className="ts-answer-text"
          disabled={readOnly}
          onChange={(e) => onChange?.({ type: "short", text: e.target.value })}
          placeholder="输入你的回答…"
          rows={4}
          value={value?.type === "short" ? value.text : ""}
        />
      ) : null}

      {review?.comment ? <p className="ts-review-comment">老师评语：{review.comment}</p> : null}
    </section>
  );
}
