import type { CpuGuideViewModel } from "../controller/viewModel.ts";

/** All prompt gates and option states are supplied by the controller. */
export function GuidedPanel({
  model,
  onAnswer,
}: {
  model: CpuGuideViewModel;
  onAnswer: (promptId: string, option: number) => void;
}) {
  if (model.prompts.length === 0) return null;
  return (
    <section aria-label="引导任务" className="cpu-guide">
      <div className="cpu-panel-heading">
        <h3>先看懂，再预测</h3>
        <p className="cpu-panel-note">
          完成 {model.answeredCount} / {model.prompts.length} ——全部答对才能提交判定。
        </p>
      </div>
      <ol className="cpu-guide-list">
        {model.prompts.map((prompt) => (
          <li
            className={[
              "cpu-guide-item",
              prompt.answered ? "is-done" : "",
              prompt.next ? "is-next" : "",
              prompt.blocking ? "is-blocking" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={prompt.id}
          >
            <p className="cpu-guide-prompt">
              {prompt.answered ? <span className="cpu-guide-check">✓</span> : null}
              {prompt.prompt}
              {prompt.at !== undefined ? (
                <span className="cpu-guide-at">在周期 {prompt.at} 处回答</span>
              ) : null}
            </p>
            {prompt.answered ? (
              <p className="cpu-guide-reveal">{prompt.reveal}</p>
            ) : prompt.next ? (
              <div className="cpu-guide-options">
                {prompt.byteTarget ? (
                  <p className="cpu-guide-bytegate" role="note">
                    先用下面的位开关把字节拨成 <code>{prompt.byteTarget}</code>，再回答。
                  </p>
                ) : null}
                {prompt.options.map((option) => (
                  <button
                    className={`cpu-guide-option${option.wrong ? " is-wrong" : ""}`}
                    disabled={option.disabled}
                    key={option.index}
                    onClick={() => onAnswer(prompt.id, option.index)}
                    type="button"
                  >
                    {option.label}
                    {option.note ? <span className="cpu-guide-note">{option.note}</span> : null}
                  </button>
                ))}
                {prompt.blocking ? (
                  <p className="cpu-guide-blocknote">答对这一题，机器才会继续走。</p>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
