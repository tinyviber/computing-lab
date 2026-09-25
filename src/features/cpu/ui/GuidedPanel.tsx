import type { CpuPrompt, CpuStageDef } from "../domain/stages.ts";

/**
 * The guided checklist (issue #70 §5.2): the stage's predict/observe
 * prompts in order. Answered prompts pin their reveal; the next one asks;
 * later ones stay dimmed. Prompts with `at` also gate the stepper — the
 * page passes the currently blocking prompt back in.
 */
export function GuidedPanel(props: {
  stage: CpuStageDef;
  /** Ids answered correctly so far. */
  answered: ReadonlySet<string>;
  /** The last wrong pick, to mark the option red. */
  wrongPick: { promptId: string; option: number } | null;
  /** Prompt currently blocking the stepper, if any. */
  blocking: CpuPrompt | null;
  onAnswer: (promptId: string, option: number) => void;
}) {
  const { stage, answered, wrongPick, blocking, onAnswer } = props;
  const prompts = stage.guided?.prompts ?? [];
  if (prompts.length === 0) return null;
  const nextIndex = prompts.findIndex((p) => !answered.has(p.id));

  return (
    <section aria-label="引导任务" className="cpu-guide">
      <div className="cpu-panel-heading">
        <h3>先看懂，再预测</h3>
        <p className="cpu-panel-note">
          完成 {answered.size} / {prompts.length} ——全部答对才能提交判定。
        </p>
      </div>
      <ol className="cpu-guide-list">
        {prompts.map((prompt, i) => {
          const isAnswered = answered.has(prompt.id);
          const isNext = i === nextIndex;
          const classes = [
            "cpu-guide-item",
            isAnswered ? "is-done" : "",
            isNext ? "is-next" : "",
            blocking?.id === prompt.id ? "is-blocking" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li className={classes} key={prompt.id}>
              <p className="cpu-guide-prompt">
                {isAnswered ? <span className="cpu-guide-check">✓</span> : null}
                {prompt.prompt}
                {prompt.at !== undefined ? (
                  <span className="cpu-guide-at">在周期 {prompt.at} 处回答</span>
                ) : null}
              </p>
              {isAnswered ? (
                <p className="cpu-guide-reveal">{prompt.reveal}</p>
              ) : isNext ? (
                <div className="cpu-guide-options">
                  {prompt.options.map((option, oi) => (
                    <button
                      className={`cpu-guide-option${
                        wrongPick?.promptId === prompt.id && wrongPick.option === oi
                          ? " is-wrong"
                          : ""
                      }`}
                      key={oi}
                      onClick={() => onAnswer(prompt.id, oi)}
                      type="button"
                    >
                      {option.label}
                      {option.note ? <span className="cpu-guide-note">{option.note}</span> : null}
                    </button>
                  ))}
                  {blocking?.id === prompt.id ? (
                    <p className="cpu-guide-blocknote">答对这一题，机器才会继续走。</p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
