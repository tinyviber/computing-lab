/**
 * Event timeline: every processed step as one row — emits, deliveries,
 * faults, and drops merged by the shared `step` counter. Clicking a row
 * scrubs the device panels to that moment (the `after` snapshot rides
 * each row, so no recomputation needed).
 */

import { PORT_LABEL } from "../domain/model.ts";
import { EVENT_KIND_LABEL } from "../domain/scenario.ts";
import type { DroppedEvent, SimRun, TraceRow } from "../domain/sim.ts";

const CAUSE_LABEL: Record<DroppedEvent["cause"], string> = {
  "link-down": "链路断开",
  "device-down": "设备宕机",
  timeout: "超出时限",
  loop: "回到已走过的节点",
  "no-emit": "节点不能产生事件",
};

const FAULT_LABEL: Record<string, string> = {
  "link-down": "线路断开",
  "link-up": "线路恢复",
  "device-down": "宕机",
  "device-up": "恢复上线",
};

type Row = { step: number; tick: number; drop?: DroppedEvent; trace?: TraceRow };

export function mergeRows(run: SimRun): Row[] {
  const rows: Row[] = [
    ...run.trace.map((trace) => ({ step: trace.step, tick: trace.tick, trace })),
    ...run.dropped.map((drop) => ({ step: drop.step, tick: drop.tick, drop })),
  ];
  rows.sort((a, b) => a.step - b.step);
  return rows;
}

export function EventTimeline(props: {
  cursor: number;
  onScrub: (step: number) => void;
  run: SimRun;
}) {
  const { cursor, onScrub, run } = props;
  const rows = mergeRows(run);
  if (rows.length === 0) {
    return <p className="is-timeline-empty">这个场景没有产生任何事件。</p>;
  }
  return (
    <div className="is-timeline" role="table" aria-label="事件时间线">
      <div className="is-timeline-head" role="row">
        <span>拍</span>
        <span>事件</span>
        <span>到达</span>
        <span>去向</span>
      </div>
      <ol className="is-timeline-rows">
        {rows.map((row) => {
          const active = row.step === cursor;
          if (row.drop) {
            const d = row.drop;
            return (
              <li key={row.step}>
                <button
                  className={`is-row is-row-drop${active ? " is-current" : ""}`}
                  onClick={() => onScrub(row.step)}
                  type="button"
                >
                  <span className="is-tick">t{d.tick}</span>
                  <span className="is-kind">
                    {EVENT_KIND_LABEL[d.kind] ?? d.kind} {d.payload}
                  </span>
                  <span className="is-to">
                    {d.from} → {d.to}·{PORT_LABEL[d.port] ?? d.port}
                  </span>
                  <span className="is-note">丢弃：{CAUSE_LABEL[d.cause]}</span>
                </button>
              </li>
            );
          }
          const t = row.trace!;
          return (
            <li key={row.step}>
              <button
                className={`is-row${active ? " is-current" : ""}${
                  t.port === "emit" || t.kind === "fault" ? " is-row-stim" : ""
                }`}
                onClick={() => onScrub(row.step)}
                type="button"
              >
                <span className="is-tick">t{t.tick}</span>
                <span className="is-kind">
                  {EVENT_KIND_LABEL[t.kind] ?? t.kind} {t.payload}
                </span>
                <span className="is-to">
                  {t.port === "emit"
                    ? `${t.node} 产生`
                    : t.kind === "fault"
                      ? `${t.node} ${FAULT_LABEL[t.note ?? ""] ?? t.note}`
                      : `${t.from} → ${t.node}·${PORT_LABEL[t.port] ?? t.port}`}
                </span>
                <span className="is-note">
                  {t.note ?? (t.emits.length > 0 ? `→ ${t.emits.map((e) => e.to).join("、")}` : "")}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
