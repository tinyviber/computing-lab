/**
 * Results panel: the public sweep plus the server's hidden judgement,
 * with the counterexample's diff summary and a replay hook that loads
 * the failing scenario back into the preview timeline.
 */

import type { IsCounterexample, IsJudgeResult } from "../domain/protocol.ts";
import type { PublicRunOutcome } from "../lesson/state.ts";

const REASON_TEXT: Record<string, string> = {
  done: "跑完",
  budget: "超出事件预算",
};

const DROP_TEXT: Record<string, string> = {
  "link-down": "链路断开",
  "device-down": "设备宕机",
  timeout: "超出时限",
  loop: "事件回到走过的节点",
  "no-emit": "节点不产生事件",
};

function diffText(c: IsCounterexample): string {
  const parts: string[] = [];
  if (c.reason) parts.push(REASON_TEXT[c.reason]);
  if (c.eventsUsed > c.eventBudget) {
    parts.push(`用了 ${c.eventsUsed} 步，超出用例预算 ${c.eventBudget} 步`);
  }
  for (const d of c.dbDiff.slice(0, 3)) {
    const missing = d.missing?.length ? `，缺记录 ${d.missing.join("、")}` : "";
    parts.push(
      `设备 ${d.node} 应有 ${d.expectedCount ?? "?"} 条记录，实际 ${d.actualCount} 条${missing}`,
    );
  }
  for (const d of c.seenDiff.slice(0, 3)) {
    parts.push(`看板 ${d.node} 应收 ${d.expected} 条，实收 ${d.actual} 条`);
  }
  for (const d of c.firedDiff.slice(0, 3)) {
    parts.push(`执行器 ${d.node} ${d.expected ? "应触发而未触发" : "不该触发却触发了"}`);
  }
  for (const u of c.unapproved.slice(0, 3)) {
    parts.push(`t${u.tick} 有事件未经人工核准就到了 ${u.node}·${u.port}`);
  }
  for (const p of c.pending.slice(0, 3)) {
    parts.push(`${p.node} 还压着 ${p.count} 条未处理`);
  }
  if (c.dropped.length > 0) {
    const first = c.dropped[0];
    parts.push(
      `t${first.tick} 有事件被丢弃（${DROP_TEXT[first.cause] ?? first.cause}，共 ${c.dropped.length} 次）`,
    );
  }
  return parts.join("；");
}

/** The hidden counterexample: diff summary + replay into the preview. */
function CounterexampleBlock(props: {
  counterexample: IsCounterexample;
  onReplay?: (counterexample: IsCounterexample) => void;
}) {
  const { counterexample: c, onReplay } = props;
  return (
    <div className="is-test-counterexample" role="alert">
      <p>
        反例 {c.name}：{diffText(c)}
      </p>
      {onReplay ? (
        <button
          className="button button-ghost is-test-replay"
          onClick={() => onReplay(c)}
          type="button"
        >
          把这个场景装进预览 ↩
        </button>
      ) : null}
    </div>
  );
}

export function IsTestPanel(props: {
  runOutcome: PublicRunOutcome | null;
  judgeOutcome: IsJudgeResult | null;
  onReplayCounterexample?: (counterexample: IsCounterexample) => void;
}) {
  const { runOutcome, judgeOutcome, onReplayCounterexample } = props;
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
        <div className="is-test-block">
          <h4>
            服务器判定：{judgeOutcome.passed ? "通过" : "未通过"}（{judgeOutcome.score}/
            {judgeOutcome.total}）
          </h4>
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
