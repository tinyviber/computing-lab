/**
 * StabilityBoard — C1's rating bench. For each assigned question it lines
 * up the collected answers and highlights slot values that differ between
 * draws (the diff students should read), then hosts the 档位 picker.
 */

import type { AiEvalQuestionBrief, DrawPayload, StabilityRating } from "../domain/protocol.ts";
import { RATING_LABELS, STABILITY_RATINGS } from "../domain/protocol.ts";

/** Char-level highlight of `text` vs every sibling string in `others`. */
function DiffText({ text, others }: { text: string; others: string[] }) {
  if (others.length === 0) return <>{text}</>;
  const chars = [...text];
  return (
    <>
      {chars.map((ch, i) => {
        const differs = others.some((o) => [...o][i] !== ch || [...o].length <= i);
        return differs ? <mark key={i}>{ch}</mark> : ch;
      })}
    </>
  );
}

export function StabilityBoard(props: {
  questions: AiEvalQuestionBrief[];
  collectedFor: (questionId: string) => DrawPayload[];
  ratings: Record<string, StabilityRating>;
  onRate: (questionId: string, rating: StabilityRating | null) => void;
}) {
  const { questions, collectedFor, ratings, onRate } = props;
  return (
    <section aria-label="稳定度判定" className="ae-panel">
      <p className="eyebrow">稳定度判定</p>
      <p className="ae-hint">
        把同一问题的各次回答并排看——高亮的槽值就是变了的地方。判「稳定」需要收进至少 6
        条相同作答；摇摆/多变至少 3 条。
      </p>
      <div className="ae-board">
        {questions.map((q) => {
          const draws = collectedFor(q.id);
          const slotSets = draws.map((d) => d.slots.map((s) => s.value).join(" · "));
          const rating = ratings[q.id];
          return (
            <div className="ae-board-item" key={q.id}>
              <strong>{q.text}</strong>
              <span className="ae-hint">
                已收集 {draws.length} 条 · 不同答案 {new Set(slotSets).size} 个
              </span>
              {draws.map((d, i) => {
                const mine = slotSets[i];
                const others = slotSets.filter((_, j) => j !== i);
                const differs = others.some((o) => o !== mine);
                return (
                  <span className={`ae-diff-cell${differs ? " is-diff" : ""}`} key={d.drawId}>
                    {d.slots.length === 0 ? (
                      <em>（无槽值作答）</em>
                    ) : (
                      <DiffText others={others} text={mine} />
                    )}
                  </span>
                );
              })}
              <div className="ae-rating" role="radiogroup" aria-label={`${q.text} 的档位`}>
                {STABILITY_RATINGS.map((r) => (
                  <button
                    aria-checked={rating === r}
                    className={rating === r ? "is-active" : ""}
                    key={r}
                    onClick={() => onRate(q.id, rating === r ? null : r)}
                    role="radio"
                    type="button"
                  >
                    {RATING_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
