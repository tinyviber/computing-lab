/**
 * The concept checks of a stage — same shape as the CPU guided checklist:
 * answered prompts pin their reveal, the next unanswered one asks, later
 * ones stay dimmed. An option's note shows only after that option was
 * picked wrong. All prompts must be answered correctly before submit.
 */

import type { DecodingStageDef } from "../domain/stages.ts";

export function ConceptPanel(props: {
  stage: DecodingStageDef;
  /** Prompt ids answered correctly so far. */
  answered: ReadonlySet<string>;
  /** The last wrong pick — marks the option red and shows its note. */
  wrongPick: { promptId: string; option: number } | null;
  onAnswer: (promptId: string, option: number) => void;
}) {
  const { stage, answered, wrongPick, onAnswer } = props;
  const prompts = stage.prompts ?? [];
  if (prompts.length === 0) return null;
  const nextIndex = prompts.findIndex((p) => !answered.has(p.id));

  return (
    <section aria-label="概念检查" className="decoding-guide">
      <div className="decoding-panel-heading">
        <h3>先想清楚，再动手</h3>
        <p className="decoding-panel-note">
          答对 {answered.size} / {prompts.length} ——全部答对才能提交判定。
        </p>
      </div>
      <ol className="decoding-guide-list">
        {prompts.map((prompt, i) => {
          const isAnswered = answered.has(prompt.id);
          const isNext = i === nextIndex;
          const classes = [
            "decoding-guide-item",
            isAnswered ? "is-done" : "",
            isNext ? "is-next" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li className={classes} key={prompt.id}>
              <p className="decoding-guide-prompt">
                {isAnswered ? <span className="decoding-guide-check">✓</span> : null}
                {prompt.prompt}
              </p>
              {isAnswered ? (
                <p className="decoding-guide-reveal">{prompt.reveal}</p>
              ) : isNext ? (
                <div className="decoding-guide-options">
                  {prompt.options.map((option, oi) => {
                    const wasPickedWrong =
                      wrongPick?.promptId === prompt.id && wrongPick.option === oi;
                    return (
                      <button
                        className={`decoding-guide-option${wasPickedWrong ? " is-wrong" : ""}`}
                        key={oi}
                        onClick={() => onAnswer(prompt.id, oi)}
                        type="button"
                      >
                        {option.label}
                        {wasPickedWrong && option.note ? (
                          <span className="decoding-guide-note">{option.note}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
