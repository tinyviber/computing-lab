import type { CpuPrompt, CpuStageDef } from "../domain/stages.ts";

const toBin = (byte: number) => byte.toString(2).padStart(8, "0");

/**
 * The option buttons of one prompt. Wrong `note`s render only after that
 * option has actually been picked wrong (showing them up front leaks the
 * answer); `requiresByte` prompts stay disabled until the learner has
 * dialed the byte playground to the target value.
 */
function PromptOptions(props: {
  prompt: CpuPrompt;
  wrongPick: { promptId: string; option: number } | null;
  blocking: boolean;
  currentByte?: number;
  onAnswer: (promptId: string, option: number) => void;
}) {
  const { prompt, wrongPick, blocking, currentByte, onAnswer } = props;
  const byteGated = prompt.requiresByte !== undefined && currentByte !== prompt.requiresByte;
  return (
    <div className="cpu-guide-options">
      {byteGated ? (
        <p className="cpu-guide-bytegate" role="note">
          先用下面的位开关把字节拨成 <code>{toBin(prompt.requiresByte ?? 0)}</code>
          ，再回答。
        </p>
      ) : null}
      {prompt.options.map((option, oi) => {
        const wasPickedWrong = wrongPick?.promptId === prompt.id && wrongPick.option === oi;
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
      {blocking ? <p className="cpu-guide-blocknote">答对这一题，机器才会继续走。</p> : null}
    </div>
  );
}

/**
 * The prompt being asked right now, rendered as a compact card inside the
 * machine view (issue #70 follow-up): it sits between the clock bar and the
 * viz, so predict-and-observe happen in one viewport. `at`-gated prompts
 * block the stepper right next to the buttons that resume it.
 */
export function CurrentPromptCard(props: {
  prompt: CpuPrompt;
  wrongPick: { promptId: string; option: number } | null;
  /** True while this prompt is the one pausing the stepper. */
  blocking: boolean;
  currentByte?: number;
  onAnswer: (promptId: string, option: number) => void;
}) {
  const { prompt, wrongPick, blocking, currentByte, onAnswer } = props;
  return (
    <section aria-label="当前问题" className={`cpu-now-prompt${blocking ? " is-blocking" : ""}`}>
      <p className="cpu-guide-prompt">
        <span className="cpu-now-prompt-tag">当前题</span>
        {prompt.prompt}
        {prompt.at !== undefined ? (
          <span className="cpu-guide-at">在周期 {prompt.at} 处回答</span>
        ) : null}
      </p>
      <PromptOptions
        blocking={blocking}
        currentByte={currentByte}
        onAnswer={onAnswer}
        prompt={prompt}
        wrongPick={wrongPick}
      />
    </section>
  );
}

/**
 * The guided checklist (issue #70 §5.2): the stage's predict/observe
 * prompts in order, as a progress overview — answered prompts pin their
 * reveal, later ones stay dimmed. The live question itself renders as
 * CurrentPromptCard inside the machine view; the next item here just
 * points at it.
 */
export function GuidedPanel(props: {
  stage: CpuStageDef;
  /** Ids answered correctly so far. */
  answered: ReadonlySet<string>;
  /** Prompt currently blocking the stepper, if any. */
  blocking: CpuPrompt | null;
}) {
  const { stage, answered, blocking } = props;
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
                <p className="cpu-guide-seemachine">▼ 在下面的机器区作答</p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
