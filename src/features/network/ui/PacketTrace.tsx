/**
 * Packet trace: every processed hop as one row — the source's routing
 * decision, switch learns/forwards/floods, router next-hop choices,
 * deliveries and drops merged by the shared `step` counter. Clicking a
 * row scrubs the canvas and inspector to that moment.
 */

import { DROP_TEXT, type DropRow, type SimRun, type TraceRow } from "../domain/simulate.ts";

const ACTION_LABEL: Record<TraceRow["action"], string> = {
  send: "发出",
  forward: "转发",
  flood: "泛洪",
  deliver: "送达",
};

type Row = { step: number; drop?: DropRow; trace?: TraceRow };

export function mergeNetRows(run: SimRun): Row[] {
  const rows: Row[] = [
    ...run.trace.map((trace) => ({ step: trace.step, trace })),
    ...run.drops.map((drop) => ({ step: drop.step, drop })),
  ];
  rows.sort((a, b) => a.step - b.step);
  return rows;
}

export function PacketTrace(props: {
  cursor: number;
  onScrub: (step: number) => void;
  run: SimRun;
}) {
  const { cursor, onScrub, run } = props;
  const rows = mergeNetRows(run);
  if (rows.length === 0) {
    return <p className="net-timeline-empty">这次发送没有产生任何记录。</p>;
  }
  return (
    <div className="net-timeline" role="table" aria-label="分组轨迹">
      <div className="net-timeline-head" role="row">
        <span>步</span>
        <span>节点</span>
        <span>动作</span>
        <span>去向 / 说明</span>
      </div>
      <ol className="net-timeline-rows">
        {rows.map((row, index) => {
          const active = row.step === cursor;
          if (row.drop) {
            const d = row.drop;
            return (
              <li key={`d${index}`}>
                <button
                  className={`net-row is-row-drop${active ? " is-current" : ""}`}
                  onClick={() => onScrub(row.step)}
                  type="button"
                >
                  <span className="net-step">{d.step}</span>
                  <span className="net-node-col">{d.node}</span>
                  <span className="net-action">丢弃</span>
                  <span className="net-note">
                    {DROP_TEXT[d.reason]}（{d.note}）
                  </span>
                </button>
              </li>
            );
          }
          const t = row.trace!;
          return (
            <li key={`t${index}`}>
              <button
                className={`net-row${active ? " is-current" : ""}${
                  t.action === "deliver" ? " is-row-done" : ""
                }${t.action === "send" ? " is-row-stim" : ""}`}
                onClick={() => onScrub(row.step)}
                type="button"
              >
                <span className="net-step">{t.step}</span>
                <span className="net-node-col">
                  {t.node}
                  {t.action !== "send" ? <small>·{t.inIface}</small> : null}
                </span>
                <span className="net-action">
                  {ACTION_LABEL[t.action]}
                  {t.action === "forward" || t.action === "flood" ? ` ${t.outs.length} 口` : ""}
                </span>
                <span className="net-note">
                  {t.note}
                  {t.outs.length > 0
                    ? ` → ${t.outs.map((o) => `${o.node}·${o.iface}`).join("、")}`
                    : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
