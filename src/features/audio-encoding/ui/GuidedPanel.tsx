import type { AudioPrompt } from "../domain/stages.ts";

/**
 * Guided listening chain: all prompts are answerable in any order; a pick
 * is recorded in the draft (so the server re-verifies it) and the UI
 * immediately shows the option's note — right or wrong. Re-picking a wrong
 * prompt is allowed; what matters is what you finally submit.
 */
export function GuidedPanel(props: {
  prompts: AudioPrompt[];
  answers: Record<string, number>;
  disabled: boolean;
  onAnswer: (promptId: string, optionIndex: number) => void;
}) {
  const done = props.prompts.filter((p) => props.answers[p.id] != null).length;
  return (
    <section className="ae-panel" aria-label="引导题">
      <div className="ae-panel-heading">
        <h3>边听边答</h3>
        <span className="ae-progress-note">
          已答 {done}/{props.prompts.length}
        </span>
      </div>
      <ol className="ae-guide-list">
        {props.prompts.map((prompt) => {
          const pick = props.answers[prompt.id];
          const answered = pick != null;
          const correct = answered && prompt.options[pick]?.correct === true;
          return (
            <li className="ae-guide-item" key={prompt.id}>
              <p className="ae-guide-prompt">
                {answered ? (correct ? "✓ " : "✗ ") : ""}
                {prompt.prompt}
              </p>
              <div className="ae-guide-options" role="group">
                {prompt.options.map((option, index) => {
                  const isPick = pick === index;
                  const cls = isPick
                    ? option.correct
                      ? "ae-guide-option is-picked is-right"
                      : "ae-guide-option is-picked is-wrong"
                    : "ae-guide-option";
                  return (
                    <button
                      className={cls}
                      disabled={props.disabled}
                      key={option.label}
                      onClick={() => props.onAnswer(prompt.id, index)}
                      type="button"
                    >
                      {option.label}
                      {isPick && option.note ? (
                        <span className="ae-guide-note">{option.note}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {correct && prompt.reveal ? <p className="ae-guide-reveal">{prompt.reveal}</p> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
