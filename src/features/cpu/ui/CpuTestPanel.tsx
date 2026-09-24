import type { CpuCounterexample, CpuJudgeResult } from "../domain/protocol.ts";
import type { PublicRunOutcome } from "../lesson/state.ts";

const REASON_TEXT: Record<string, string> = {
  halted: "停机",
  "ran-off": "跑出存储器了",
  timeout: "超过周期上限了",
};

function diffText(c: CpuCounterexample): string {
  const parts: string[] = [];
  if (c.reason) parts.push(REASON_TEXT[c.reason]);
  for (const d of c.regDiff) parts.push(`${d.reg} 应为 ${d.expected}，实际是 ${d.actual}`);
  for (const d of c.memDiff.slice(0, 4)) {
    parts.push(`M[${d.addr}] 应为 ${d.expected}，实际是 ${d.actual}`);
  }
  if (c.memDiff.length > 4) parts.push(`…共 ${c.memDiff.length} 格不符`);
  if (c.branchMismatch) parts.push("分支方向不对");
  if (c.selfModMissing) parts.push("没有取到自己写过的格子");
  return parts.join("；");
}

/** Results of the public sweep + the server's hidden judgement. */
export function CpuTestPanel(props: {
  runOutcome: PublicRunOutcome | null;
  judgeOutcome: CpuJudgeResult | null;
}) {
  const { runOutcome, judgeOutcome } = props;
  if (!runOutcome && !judgeOutcome) return null;
  return (
    <section aria-label="测试结果" className="cpu-tests">
      {runOutcome ? (
        <div className="cpu-test-block">
          <h4>
            公开用例：{runOutcome.score} / {runOutcome.total} 通过
          </h4>
          <ul className="cpu-test-list">
            {runOutcome.results.map((r) => (
              <li className={r.passed ? "is-pass" : "is-fail"} key={r.name}>
                <span className="cpu-test-name">{r.name}</span>
                <span className="cpu-test-detail">
                  {r.passed ? (
                    `✓ ${r.cyclesUsed} 周期`
                  ) : (
                    <>
                      {r.reason ? REASON_TEXT[r.reason] : "结果不对"}
                      {r.memDiff.length > 0
                        ? ` · M[${r.memDiff[0].addr}]=${r.memDiff[0].actual}≠${r.memDiff[0].expected}`
                        : ""}
                      {r.regDiff.length > 0
                        ? ` · ${r.regDiff[0].reg}=${r.regDiff[0].actual}≠${r.regDiff[0].expected}`
                        : ""}
                      {r.branchMismatch ? " · 分支方向不符" : ""}
                      {r.selfModMissing ? " · 未取到自写格" : ""}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {judgeOutcome ? (
        <div className="cpu-test-block">
          <h4>
            服务器判定：{judgeOutcome.passed ? "通过" : "未通过"}（{judgeOutcome.score}/
            {judgeOutcome.total}）
          </h4>
          {judgeOutcome.testSummary.branchOneWayOnly ? (
            <p className="cpu-test-warn">分支只走了一个方向——隐藏用例两个方向都要。</p>
          ) : null}
          <ul className="cpu-test-categories">
            {Object.entries(judgeOutcome.testSummary.categories).map(([category, tally]) => (
              <li className={tally.passed === tally.total ? "is-pass" : "is-fail"} key={category}>
                {category}：{tally.passed}/{tally.total}
              </li>
            ))}
          </ul>
          {judgeOutcome.testSummary.counterexample ? (
            <p className="cpu-test-counterexample">
              反例 {judgeOutcome.testSummary.counterexample.name}：
              {diffText(judgeOutcome.testSummary.counterexample)}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
