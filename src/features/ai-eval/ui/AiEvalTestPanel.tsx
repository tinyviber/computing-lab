/**
 * AiEvalTestPanel — the judge-outcome shell (categories + counterexample +
 * error/degenerate banners), patterned on calculator's TestPanel. The
 * counterexample renders evidence as answer-vs-fact field contrast.
 */

import { Icon } from "../../../shared/ui/Icon";
import type { AiEvalJudgeResult } from "../domain/protocol.ts";

const ERROR_HINTS: Record<string, string> = {
  "transcript-mismatch":
    "证据链对不上：某条作答在服务器上重放不出来——不要手填 drawId 或改动 probe。",
  "insufficient-observations": "观测次数不足：判「稳定」至少要收进足够多次相同作答。",
  "prediction-after-draw": "预测改在了抽题之后：先想好再探测才是评测，重新来过吧。",
  "unverified-cite": "「存疑」引用的字段没有查证记录：先点槽值芯片查真值，再下结论。",
  "reason-conflict": "被质疑的字段其实和事实一致——查证记录里它是对的，换一个真正不符的字段。",
  "answer-leak": "草稿里混进了答案文本：证据只能记 probe 和 drawId。",
  "quota-exceeded": "查证配额已用尽。",
  "rate-limited": "操作太频繁，稍后再试。",
};

const DEGENERATE_HINTS: Record<string, string> = {
  "all-same-rating": "所有题都判了同一档——这不是评测，是偷懒。逐题收集证据再判。",
  "all-trust": "全部判「可信」：缺陷全漏了。对没把握的字段先查证再下结论。",
  "all-doubt": "全部判「存疑」：误伤太多，可信的回答也被冤枉了。",
  "all-human": "全部转人工等于没做裁决——该自己判断的要判断。",
};

export function AiEvalTestPanel({ judgeOutcome }: { judgeOutcome: AiEvalJudgeResult | null }) {
  if (!judgeOutcome) {
    return (
      <section aria-label="判定结果" className="test-panel is-empty">
        <p>收集证据后点「提交判定」——服务器会按同一批数据重放你的证据再打分。</p>
      </section>
    );
  }

  const { testSummary } = judgeOutcome;
  const failed = testSummary.categories.filter((c) => c.passed < c.total);

  return (
    <section aria-label="判定结果" className="test-panel">
      <header className={`test-verdict${judgeOutcome.passed ? " is-pass" : " is-fail"}`}>
        <strong>{judgeOutcome.passed ? "通过" : "未通过"}</strong>
        <span className="test-score">
          {judgeOutcome.score} / {judgeOutcome.total}
        </span>
        <span className="test-note">服务器重放证据后判定</span>
      </header>

      {testSummary.error ? (
        <p className="test-error" role="alert">
          {ERROR_HINTS[testSummary.error] ?? testSummary.error}
        </p>
      ) : null}
      {testSummary.degenerate ? (
        <p className="test-error" role="alert">
          {DEGENERATE_HINTS[testSummary.degenerate] ?? testSummary.degenerate}
        </p>
      ) : null}

      {failed.length > 0 ? (
        <div className="test-categories">
          <p className="eyebrow">未达标项</p>
          <ul>
            {failed.map((c) => (
              <li key={c.name}>
                <span className="category-name">{c.name}</span>
                <span className="category-score">
                  {c.passed} / {c.total}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {testSummary.counterexample ? (
        <div className="test-counterexample">
          <p className="eyebrow">反例</p>
          <dl className="counterexample-rows">
            <div>
              <dt>对象</dt>
              <dd>
                <code className="ae-fielddiff">{testSummary.counterexample.itemId}</code>
              </dd>
            </div>
            <div>
              <dt>应为</dt>
              <dd>{testSummary.counterexample.expected}</dd>
            </div>
            <div>
              <dt>你的结论</dt>
              <dd>{testSummary.counterexample.actual}</dd>
            </div>
            {testSummary.counterexample.evidence?.factField ? (
              <div>
                <dt>字段对照</dt>
                <dd>
                  <code className="ae-fielddiff">
                    {testSummary.counterexample.evidence.factField.id} → 事实：
                    {testSummary.counterexample.evidence.factField.value ?? "（无此条目）"}
                  </code>
                </dd>
              </div>
            ) : null}
            {testSummary.counterexample.evidence?.answerExcerpt ? (
              <div>
                <dt>证据摘要</dt>
                <dd>{testSummary.counterexample.evidence.answerExcerpt}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : judgeOutcome.passed ? (
        <p className="ae-hint">
          <Icon name="check" size={12} /> 判定通过，下一关已解锁。
        </p>
      ) : null}
    </section>
  );
}
