import type { CpuPrompt, CpuStageDef } from "../domain/stages.ts";

const toBin = (byte: number) => byte.toString(2).padStart(8, "0");

/**
 * The guided checklist (issue #70 §5.2): the stage's predict/observe
 * prompts in order. Answered prompts pin their reveal; the next one asks;
 * later ones stay dimmed. Prompts with `at` also gate the stepper — the
 * page passes the currently blocking prompt back in.
 *
 * Two guards keep a prompt honest: per-option `note`s render only after
 * that option has actually been picked wrong (showing them up front leaks
 * the answer), and `requiresByte` prompts stay disabled until the learner
 * has dialed the byte playground to the target value.
 */
export function GuidedPanel(props: {
  stage: CpuStageDef;
  /** Ids answered correctly so far. */
  answered: ReadonlySet<string>;
  /** The last wrong pick, to mark the option red and show its note. */
  wrongPick: { promptId: string; option: number } | null;
  /** Prompt currently blocking the stepper, if any. */
  blocking: CpuPrompt | null;
  /** The byte currently dialed in the C4 playground, when the stage has one. */
  currentByte?: number;
  onAnswer: (promptId: string, option: number) => void;
}) {
  const { stage, answered, wrongPick, blocking, currentByte, onAnswer } = props;
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
          const byteGated =
            prompt.requiresByte !== undefined && currentByte !== prompt.requiresByte;
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
                  {byteGated ? (
                    <p className="cpu-guide-bytegate" role="note">
                      先用下面的位开关把字节拨成 <code>{toBin(prompt.requiresByte ?? 0)}</code>
                      ，再回答。
                    </p>
                  ) : null}
                  {prompt.options.map((option, oi) => {
                    const wasPickedWrong =
                      wrongPick?.promptId === prompt.id && wrongPick.option === oi;
                    return (
                      <button
                        className={`cpu-guide-option${wasPickedWrong ? " is-wrong" : ""}`}
                        disabled={byteGated}
                        key={oi}
                        onClick={() => onAnswer(prompt.id, oi)}
                        type="button"
                      >
                        {option.label}
                        {wasPickedWrong && option.note ? (
                          <span className="cpu-guide-note">{option.note}</span>
                        ) : null}
                      </button>
                    );
                  })}
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
