/**
 * Probe console: pick a source host, type a destination, send. Manual
 * probes share a live MAC-table state (reset on draft edits or 清空),
 * which is what makes "再发一次，路径变短了" observable.
 */

import { useState } from "react";
import type { NetProbeLogEntry } from "../lesson/state.ts";
import type { NetNode } from "../domain/topology.ts";

export function ProbeConsole(props: {
  hosts: NetNode[];
  log: NetProbeLogEntry[];
  macCount: number;
  onSend: (src: string, dst: string) => void;
  onResetMacs: () => void;
}) {
  const { hosts, log, macCount, onSend, onResetMacs } = props;
  const [src, setSrc] = useState(hosts[0]?.id ?? "");
  const [dst, setDst] = useState("");
  const effectiveSrc = hosts.some((h) => h.id === src) ? src : (hosts[0]?.id ?? "");

  return (
    <section aria-label="探针台" className="net-probe">
      <div className="net-probe-controls">
        <label className="net-field net-probe-src">
          <span>从</span>
          <select onChange={(e) => setSrc(e.target.value)} value={effectiveSrc}>
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.label}
              </option>
            ))}
          </select>
        </label>
        <label className="net-field net-probe-dst">
          <span>ping 目标 IP</span>
          <input
            onChange={(e) => setDst(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && dst.trim() && effectiveSrc) onSend(effectiveSrc, dst.trim());
            }}
            placeholder="例如对端主机的地址"
            value={dst}
          />
        </label>
        <button
          className="button button-primary"
          disabled={!effectiveSrc || dst.trim() === ""}
          onClick={() => onSend(effectiveSrc, dst.trim())}
          type="button"
        >
          发送探针
        </button>
        <button className="button button-ghost" onClick={onResetMacs} type="button">
          清空 MAC 表{macCount > 0 ? `（${macCount} 条）` : ""}
        </button>
      </div>
      {log.length > 0 ? (
        <ol className="net-probe-log">
          {[...log].reverse().map((entry) => (
            <li className={entry.ok ? "net-probe-ok" : "net-probe-bad"} key={entry.id}>
              <code>
                {entry.src.toUpperCase()} → {entry.dst}
              </code>
              <span>{entry.summary}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="net-probe-hint">
          还没有发过探针。提示：连续发两次同一个目标，第二次的路径会更短。
        </p>
      )}
    </section>
  );
}
