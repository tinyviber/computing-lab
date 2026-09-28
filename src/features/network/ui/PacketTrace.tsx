/**
 * Packet trace: one row per simulation step, click to scrub. Playback
 * controls (step / run / pause / reset) sit in the header — the rows
 * carry every hop's decision copy so the table doubles as the
 * "为什么是这一跳" explanation.
 */

import { useEffect } from "react";
import type { SimStep } from "../domain/simulate.ts";

const ACTION_LABEL: Record<SimStep["action"], string> = {
  consult: "查表",
  send: "判定",
  learn: "学习",
  forward: "转发",
  flood: "泛洪",
  deliver: "送达",
  drop: "丢弃",
  ignore: "忽略",
};

const LEG_LABEL: Record<SimStep["leg"], string> = { request: "去程", reply: "回程" };

export function PacketTrace(props: {
  title: string | null;
  steps: SimStep[];
  cursor: number;
  playing: boolean;
  onCursor: (seq: number) => void;
  onPlaying: (playing: boolean) => void;
}) {
  const { title, steps, cursor, playing, onCursor, onPlaying } = props;
  const maxSeq = steps.length;

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      onCursor(Math.min(cursor + 1, maxSeq));
      if (cursor + 1 >= maxSeq) onPlaying(false);
    }, 650);
    return () => clearInterval(timer);
  }, [playing, cursor, maxSeq, onCursor, onPlaying]);

  if (!title) {
    return <p className="net-trace-empty">发一个探针，或点一条公开用例，轨迹会出现在这里。</p>;
  }
  return (
    <section aria-label="探针轨迹" className="net-trace">
      <header className="net-trace-head">
        <strong>{title}</strong>
        <div className="net-player">
          <button
            className="button button-ghost"
            disabled={cursor <= 0}
            onClick={() => onCursor(cursor - 1)}
            type="button"
          >
            ← 上一步
          </button>
          <button
            className="button button-ghost"
            disabled={cursor >= maxSeq}
            onClick={() => onCursor(cursor + 1)}
            type="button"
          >
            下一步 →
          </button>
          <button
            className="button button-ghost"
            disabled={maxSeq === 0}
            onClick={() =>
              playing
                ? onPlaying(false)
                : (cursor >= maxSeq ? onCursor(0) : null, onPlaying(!playing))
            }
            type="button"
          >
            {playing ? "暂停" : "连跑"}
          </button>
          <button
            className="button button-ghost"
            onClick={() => {
              onPlaying(false);
              onCursor(0);
            }}
            type="button"
          >
            复位
          </button>
          <span className="net-player-count">
            {cursor} / {maxSeq}
          </span>
        </div>
      </header>
      <div className="net-trace-table" role="table">
        <div className="net-trace-row net-trace-headrow" role="row">
          <span>#</span>
          <span>段</span>
          <span>节点</span>
          <span>动作</span>
          <span>去向</span>
          <span>TTL</span>
          <span>说明</span>
        </div>
        <ol className="net-trace-rows">
          {steps.map((s) => (
            <li key={s.seq}>
              <button
                className={`net-trace-row${s.seq === cursor ? " net-current" : ""}${s.seq > cursor ? " net-future" : ""} net-act-${s.action}`}
                onClick={() => onCursor(s.seq)}
                type="button"
              >
                <span>{s.seq}</span>
                <span>{LEG_LABEL[s.leg]}</span>
                <span>{s.at}</span>
                <span>{ACTION_LABEL[s.action]}</span>
                <span>{s.to?.join("、") ?? "—"}</span>
                <span>{s.ttl ?? ""}</span>
                <span>{s.detail}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
