/**
 * Results panel: the public probe sweep plus the server's hidden
 * judgement. The counterexample carries its full case so a click replays
 * it into the packet trace.
 */

import type { NetCounterexample, NetJudgeResult } from "../domain/protocol.ts";
import type { NetCaseResult } from "../domain/scenario.ts";

export type NetPublicOutcome = { score: number; total: number; results: NetCaseResult[] };

function CounterexampleBlock(props: {
  counterexample: NetCounterexample;
  onReplay?: (c: NetCounterexample) => void;
}) {
  const { counterexample: c, onReplay } = props;
  return (
    <div className="is-test-counterexample" role="alert">
      <p>
        反例 {c.name}：{c.detail}
      </p>
      {onReplay ? (
        <button
          className="button button-ghost is-test-replay"
          onClick={() => onReplay(c)}
          type="button"
        >
          把这个场景装进轨迹 ↩
        </button>
      ) : null}
    </div>
  );
}

export function NetTestPanel(props: {
  runOutcome: NetPublicOutcome | null;
  judgeOutcome: NetJudgeResult | null;
  onReplayCounterexample?: (c: NetCounterexample) => void;
  onShowCase?: (title: string, result: NetCaseResult) => void;
}) {
  const { runOutcome, judgeOutcome, onReplayCounterexample, onShowCase } = props;
  if (!runOutcome && !judgeOutcome) return null;
  return (
    <section aria-label="测试结果" className="is-tests">
      {runOutcome ? (
        <div className="is-test-block">
          <h4>
            公开用例：{runOutcome.score} / {runOutcome.total} 通过
          </h4>
          <ul className="is-test-list">
            {runOutcome.results.map((r) => (
              <li className={r.passed ? "is-pass" : "is-fail"} key={r.name}>
                <span className="is-test-name">{r.name}</span>
                <span className="is-test-detail">
                  {r.passed ? `✓ ${r.eventsUsed} 步` : r.detail || "断言未满足"}
                  {onShowCase && r.probes.length > 0 ? (
                    <button
                      className="button button-ghost net-case-replay"
                      onClick={() => onShowCase(r.name, r)}
                      type="button"
                    >
                      看轨迹
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {judgeOutcome ? (
        <div className="is-test-block">
          <h4>
            服务器判定：{judgeOutcome.passed ? "通过" : "未通过"}（{judgeOutcome.score}/
            {judgeOutcome.total}）
          </h4>
          {judgeOutcome.testSummary.error ? (
            <p className="is-fail">{judgeOutcome.testSummary.error}</p>
          ) : null}
          <ul className="is-test-categories">
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
