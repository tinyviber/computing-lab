/**
 * Results panel for the network lab: the public sweep plus the server's
 * hidden judgement, with the counterexample's diff summary and a replay
 * hook that loads the failing probe back into the preview trace.
 */

import type { NetCounterexample, NetJudgeResult } from "../domain/protocol.ts";
import type { PublicRunOutcome } from "../lesson/state.ts";
import { DROP_TEXT } from "../domain/simulate.ts";

const REASON_TEXT: Record<string, string> = {
  done: "跑完",
  budget: "超出事件预算",
};

function diffText(c: NetCounterexample): string {
  const parts: string[] = [];
  if (c.reason) parts.push(REASON_TEXT[c.reason]);
  if (c.eventsUsed > c.eventBudget) {
    parts.push(`用了 ${c.eventsUsed} 步，超出用例预算 ${c.eventBudget} 步`);
  }
  if (c.pathDiff) {
    parts.push(
      `期望路径 ${c.pathDiff.expected.join("→")}，实际 ${
        c.pathDiff.actual.length > 0 ? c.pathDiff.actual.join("→") : "没送达"
      }`,
    );
  }
  if (c.dropDiff) {
    const expect = `应丢弃于 ${c.dropDiff.expectedAt.join("/")}（${c.dropDiff.expectedReason
      .map((r) => DROP_TEXT[r])
      .join("/")}）`;
    const actual =
      c.dropDiff.actualKind === "delivered"
        ? "实际送达了"
        : `实际丢弃于 ${c.dropDiff.actualAt}（${
            c.dropDiff.actualReason ? DROP_TEXT[c.dropDiff.actualReason] : "?"
          }）`;
    parts.push(`${expect}，${actual}`);
  }
  for (const d of c.macDiff.slice(0, 3)) {
    parts.push(
      `${d.at} 应把 ${d.host} 的 MAC 学到 ${d.expectedIface ?? "?"}，实际 ${
        d.actualIface ?? "没学到"
      }`,
    );
  }
  if (c.floodDiff) {
    parts.push(
      c.floodDiff.expected === "flood"
        ? "应出现泛洪，实际只有单播"
        : "应走单播（表已学过），实际泛洪了",
    );
  }
  for (const d of c.hopDiff.slice(0, 3)) {
    parts.push(
      `${d.node} 应从 ${d.iface} 送出，实际用了 ${d.used.length > 0 ? d.used.join("、") : "没有发出"}`,
    );
  }
  return parts.join("；");
}

/** The hidden counterexample: diff summary + replay into the preview. */
function CounterexampleBlock(props: {
  counterexample: NetCounterexample;
  onReplay?: (counterexample: NetCounterexample) => void;
}) {
  const { counterexample: c, onReplay } = props;
  return (
    <div className="net-test-counterexample" role="alert">
      <p>
        反例 {c.name}：{diffText(c)}
      </p>
      {onReplay ? (
        <button
          className="button button-ghost net-test-replay"
          onClick={() => onReplay(c)}
          type="button"
        >
          把这个探针装进预览 ↩
        </button>
      ) : null}
    </div>
  );
}

export function NetTestPanel(props: {
  runOutcome: PublicRunOutcome | null;
  judgeOutcome: NetJudgeResult | null;
  onReplayCounterexample?: (counterexample: NetCounterexample) => void;
}) {
  const { runOutcome, judgeOutcome, onReplayCounterexample } = props;
  if (!runOutcome && !judgeOutcome) return null;
  return (
    <section aria-label="测试结果" className="net-tests">
      {runOutcome ? (
        <div className="net-test-block">
          <h4>
            公开用例：{runOutcome.score} / {runOutcome.total} 通过
          </h4>
          <ul className="net-test-list">
            {runOutcome.results.map((r) => (
              <li className={r.passed ? "is-pass" : "is-fail"} key={r.name}>
                <span className="net-test-name">{r.name}</span>
                <span className="net-test-detail">
                  {r.passed
                    ? `✓ ${r.eventsUsed} 步`
                    : r.reason
                      ? REASON_TEXT[r.reason]
                      : "断言未满足"}
                  {!r.passed && r.eventsUsed > r.eventBudget
                    ? ` · 超出预算 ${r.eventBudget} 步`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {judgeOutcome ? (
        <div className="net-test-block">
          <h4>
            服务器判定：{judgeOutcome.passed ? "通过" : "未通过"}（{judgeOutcome.score}/
            {judgeOutcome.total}）
          </h4>
          {judgeOutcome.testSummary.error ? (
            <p className="net-test-error" role="alert">
              结构问题：{judgeOutcome.testSummary.error}
            </p>
          ) : null}
          <ul className="net-test-categories">
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
