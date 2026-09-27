/**
 * Event table: one row per tick where the controller actually did
 * something — a rule row hit, an actuator flipped, or the env hit a
 * physical clamp. Clicking a row seeks the cursor to that tick.
 */

import {
  ACTUATOR_IDS,
  ACTUATOR_LABEL,
  SENSOR_LABEL,
  SENSOR_UNIT,
  fmtFixed,
  type SensorId,
} from "../domain/model.ts";
import { rowText, type RuleRow } from "../domain/rules.ts";
import { tickClock, type SimRun } from "../domain/simulate.ts";

export function EventTable(props: {
  run: SimRun;
  rules: RuleRow[];
  sensors: readonly SensorId[];
  cursor: number;
  onSeek: (t: number) => void;
}) {
  const { run, rules, sensors, cursor, onSeek } = props;

  const rows = run.trace
    .map((row, i) => {
      const prev = i > 0 ? run.trace[i - 1] : null;
      const flipped = ACTUATOR_IDS.filter(
        (a) => row.acts[a] !== (prev ? prev.acts[a] : run.initActs[a]),
      );
      const interesting = row.firedRows.length > 0 || flipped.length > 0 || row.clamped.length > 0;
      if (!interesting) return null;
      const delta = sensors
        .map((v) => {
          const before = prev ? prev.env[v] : run.initEnv[v];
          const d = row.env[v] - before;
          return `${SENSOR_LABEL[v].slice(0, 2)}${d >= 0 ? "+" : ""}${fmtFixed(d)}`;
        })
        .join(" ");
      return {
        t: row.t,
        read: sensors
          .map((v) => `${SENSOR_LABEL[v]} ${fmtFixed(row.read[v])}${SENSOR_UNIT[v]}`)
          .join("，"),
        hits: row.firedRows.map(
          (i) =>
            `第${i + 1}行 ${rowText(rules[i] ?? { when: { kind: "leaf", sensor: "airTemp", op: "<", value: 0 }, actuator: "heater", set: "on" })}`,
        ),
        action: [
          ...flipped.map((a) => `${ACTUATOR_LABEL[a]}→${row.acts[a] ? "开" : "关"}`),
          ...row.clamped.map((v) => `${SENSOR_LABEL[v]}触到边界`),
        ].join("，"),
        delta,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return (
    <div className="gh-events">
      <div className="gh-events-head">
        <span>拍</span>
        <span>读数</span>
        <span>命中行</span>
        <span>动作</span>
        <span>env Δ</span>
      </div>
      {rows.length === 0 ? (
        <p className="gh-events-empty">整段运行没有规则命中或动作翻转——环境完全靠惯性走。</p>
      ) : (
        <ol className="gh-events-rows">
          {rows.map((r) => (
            <li key={r.t}>
              <button
                className={`gh-event-row${r.t === cursor ? " is-current" : ""}`}
                onClick={() => onSeek(r.t)}
                type="button"
              >
                <span className="gh-tick">
                  {r.t} <small>{tickClock(r.t)}</small>
                </span>
                <span>{r.read}</span>
                <span>{r.hits.join("；")}</span>
                <span>{r.action || "—"}</span>
                <span className="gh-tick">{r.delta}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
