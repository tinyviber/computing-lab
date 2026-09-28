/**
 * The 4-block control loop — 传感器 → 控制器 → 执行器 → 环境 — rendered
 * for the current tick: what the sensors read, which rule row hit, what
 * the actuators were told, and where the env landed (with the ambient
 * target it is relaxing toward).
 */

import { ACTUATOR_IDS, ACTUATOR_LABEL, fmtSensor, type ActuatorId } from "../domain/model.ts";
import { rowText, type RuleRow } from "../domain/rules.ts";
import type { SimRun } from "../domain/simulate.ts";

export function LoopDiagram(props: { run: SimRun; cursor: number; rules: RuleRow[] }) {
  const { run, cursor, rules } = props;
  const row = run.trace[Math.min(cursor, run.trace.length - 1)];
  if (!row) return null;
  const onActs = ACTUATOR_IDS.filter((a) => row.acts[a]);

  const firedText =
    row.firedRows.length === 0
      ? "无命中 → 全部保持原状"
      : row.firedRows
          .map((i) => (rules[i] ? `第${i + 1}行：${rowText(rules[i])}` : `第${i + 1}行`))
          .join("；");

  return (
    <div className="gh-loop" role="group" aria-label="控制回路">
      <div className="gh-loop-block">
        <span className="gh-loop-name">传感器</span>
        <span className="gh-loop-value">
          温度 {fmtSensor("airTemp", row.read.airTemp)}
          <br />
          墒情 {fmtSensor("soilMoisture", row.read.soilMoisture)}
        </span>
      </div>
      <span aria-hidden="true" className="gh-loop-arrow">
        →
      </span>
      <div className={`gh-loop-block${row.firedRows.length > 0 ? " is-live" : ""}`}>
        <span className="gh-loop-name">控制器</span>
        <span className="gh-loop-value">{firedText}</span>
      </div>
      <span aria-hidden="true" className="gh-loop-arrow">
        →
      </span>
      <div className={`gh-loop-block${onActs.length > 0 ? " is-live" : ""}`}>
        <span className="gh-loop-name">执行器</span>
        <span className="gh-loop-value">
          {onActs.length === 0
            ? "全部关"
            : onActs.map((a: ActuatorId) => ACTUATOR_LABEL[a]).join("、") + " 开"}
        </span>
      </div>
      <span aria-hidden="true" className="gh-loop-arrow">
        →
      </span>
      <div className={`gh-loop-block${row.clamped.length > 0 ? " is-warn" : ""}`}>
        <span className="gh-loop-name">环境</span>
        <span className="gh-loop-value">
          温度 {fmtSensor("airTemp", row.env.airTemp)}（外界 {fmtSensor("airTemp", row.amb.airTemp)}
          ）
          <br />
          墒情 {fmtSensor("soilMoisture", row.env.soilMoisture)}
          {row.clamped.length > 0 ? " · 触边界" : ""}
        </span>
      </div>
    </div>
  );
}
