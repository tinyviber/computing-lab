/**
 * Results panel: the last 试运行 verdict (single public case, local only)
 * plus the server's hidden judgement — per-category tallies and the first
 * failing case as a counterexample that replays into the preview.
 */

import {
  ACTUATOR_LABEL,
  SENSOR_LABEL,
  fmtFixed,
  type ActuatorId,
  type SensorId,
} from "../domain/model.ts";
import type { GhCounterexample, GhFirstViolation, GhJudgeResult } from "../domain/protocol.ts";
import type { GhRunOutcome } from "../lesson/state.ts";

const METRIC_TEXT: Record<GhFirstViolation["metric"], string> = {
  "no-rule-fired": "没有规则命中",
  "leaf-one-sided": "条件只朝一个方向判",
  neverExceeded: "越过安全线",
  inBand: "在带率不足",
  endInBand: "收尾不在带内",
  switchCount: "切换次数超限",
  mustUse: "执行器没被规则开过",
};

function subjectText(subject: SensorId | ActuatorId | undefined): string {
  if (!subject) return "";
  if (subject in SENSOR_LABEL) return SENSOR_LABEL[subject as SensorId];
  return ACTUATOR_LABEL[subject as ActuatorId];
}

function violationText(v: GhFirstViolation): string {
  const subject = subjectText(v.subject);
  const parts = [`第 ${v.tick} 拍 ${METRIC_TEXT[v.metric]}${subject ? `（${subject}）` : ""}`];
  if (v.metric === "inBand") {
    parts.push(`在带率 ${(v.value / 10).toFixed(1)}%`);
  } else if (v.metric === "switchCount") {
    parts.push(`计 ${v.value} 次`);
  } else if (v.band) {
    parts.push(`读数 ${fmtFixed(v.value)}，允许 ${fmtFixed(v.band[0])}–${fmtFixed(v.band[1])}`);
  }
  return parts.join("，");
}

function CounterexampleBlock(props: {
  counterexample: GhCounterexample;
  onReplay?: (counterexample: GhCounterexample) => void;
}) {
  const { counterexample: c, onReplay } = props;
  return (
    <div className="gh-counterexample" role="alert">
      <p>
        反例 {c.name}（{c.category}）：{c.reason ?? "断言未满足"}
        <br />
        <span className="gh-counterexample-detail">{violationText(c.firstViolation)}</span>
        <span className="gh-counterexample-detail">
          该场景在带 {c.metrics.inBandTicks}/{c.metrics.scoredTicks} 拍，风扇切{" "}
          {c.metrics.switchCount.fan} 次、加热器切 {c.metrics.switchCount.heater} 次
        </span>
      </p>
      {onReplay ? (
        <button className="button button-ghost gh-replay" onClick={() => onReplay(c)} type="button">
          把这个场景装进预览 ↩
        </button>
      ) : null}
    </div>
  );
}

export function GreenhouseTestPanel(props: {
  runOutcome: GhRunOutcome | null;
  judgeOutcome: GhJudgeResult | null;
  onReplayCounterexample?: (counterexample: GhCounterexample) => void;
}) {
  const { runOutcome, judgeOutcome, onReplayCounterexample } = props;
  if (!runOutcome && !judgeOutcome) return null;
  return (
    <section aria-label="测试结果" className="gh-tests">
      {runOutcome ? (
        <div className="gh-test-block">
          <h4>
            试运行 · {runOutcome.caseName}：{runOutcome.verdict.passed ? "通过" : "未通过"}
          </h4>
          <p className="gh-test-detail">
            {runOutcome.verdict.passed
              ? `在带 ${runOutcome.verdict.metrics.inBandTicks}/${runOutcome.verdict.metrics.scoredTicks} 拍 · 加热器切 ${runOutcome.verdict.metrics.switchCount.heater} 次 · 风扇切 ${runOutcome.verdict.metrics.switchCount.fan} 次`
              : runOutcome.verdict.reason}
          </p>
        </div>
      ) : null}

      {judgeOutcome ? (
        <div className="gh-test-block">
          <h4>
            服务器判定：{judgeOutcome.passed ? "通过" : "未通过"}（{judgeOutcome.score}/
            {judgeOutcome.total}）
          </h4>
          <ul className="gh-test-categories">
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
