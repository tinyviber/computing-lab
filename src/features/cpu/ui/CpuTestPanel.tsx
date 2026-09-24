import type { CpuCounterexample, CpuJudgeResult } from "../domain/protocol.ts";
import type { PublicRunOutcome } from "../lesson/state.ts";
import { REASON_LABEL, TRACE_HEAD, TraceRows } from "./TraceTable.tsx";

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

/** The hidden counterexample: diff summary, bounded trace, and replay. */
function CounterexampleBlock(props: {
  counterexample: CpuCounterexample;
  onReplay?: (counterexample: CpuCounterexample) => void;
}) {
  const { counterexample: c, onReplay } = props;
  return (
    <div className="cpu-test-counterexample" role="alert">
      <p>
        反例 {c.name}：{diffText(c)}
      </p>
      {onReplay ? (
        <button
          className="button button-ghost cpu-test-replay"
          onClick={() => onReplay(c)}
          type="button"
        >
          把这份数据装进机器视图 ↩
        </button>
      ) : null}
      <details className="cpu-trace cpu-counter-trace">
        <summary>
          逐周期轨迹（{c.trace.length} 周期，{REASON_LABEL[c.reason ?? "halted"]}
          {c.selfModFetch ? " · 取到过自写格" : ""}）
        </summary>
        <div className="cpu-trace-scroll">
          <table>
            {TRACE_HEAD}
            <tbody>
              <TraceRows finalRegs={c.finalRegs} trace={c.trace} />
              <tr className="cpu-trace-end is-current">
                <td colSpan={8}>
                  结束：{REASON_LABEL[c.reason ?? "halted"]}；A={c.finalRegs.A}，B=
                  {c.finalRegs.B}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** Results of the public sweep + the server's hidden judgement. */
export function CpuTestPanel(props: {
  runOutcome: PublicRunOutcome | null;
  judgeOutcome: CpuJudgeResult | null;
  onReplayCounterexample?: (counterexample: CpuCounterexample) => void;
}) {
  const { runOutcome, judgeOutcome, onReplayCounterexample } = props;
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
            <CounterexampleBlock
              counterexample={judgeOutcome.testSummary.counterexample}
              onReplay={onReplayCounterexample}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
