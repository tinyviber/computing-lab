/**
 * Actuator on/off bands sharing the chart's time axis — one row per
 * actuator in the stage palette. The chatter lesson reads straight off
 * this view: on-blocks peppered every other tick is a dead zone of zero.
 */

import { ACTUATOR_LABEL, type ActuatorId } from "../domain/model.ts";
import type { SimRun } from "../domain/simulate.ts";

export function ActuatorTimeline(props: {
  run: SimRun;
  actuators: readonly ActuatorId[];
  cursor: number;
  onScrub?: (t: number) => void;
}) {
  const { run, actuators, cursor, onScrub } = props;
  const ticks = run.trace.length;
  if (ticks === 0) return null;
  const pct = (t: number) => `${((t / ticks) * 100).toFixed(2)}%`;
  const cursorPct = `${(((Math.min(cursor, ticks - 1) + 0.5) / ticks) * 100).toFixed(2)}%`;

  return (
    <div
      className="gh-timeline"
      onClick={(e) => {
        if (!onScrub) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const t = Math.floor(((e.clientX - rect.left) / rect.width) * ticks);
        onScrub(Math.min(Math.max(t, 0), ticks - 1));
      }}
      role="list"
    >
      {actuators.map((a) => (
        <div className="gh-timeline-row" key={a} role="listitem">
          <span className="gh-timeline-name">{ACTUATOR_LABEL[a]}</span>
          <div className={`gh-timeline-track gh-act-${a}`}>
            {run.trace.map((row, t) =>
              row.acts[a] ? (
                <span className="gh-on" key={t} style={{ left: pct(t), width: pct(1) }} />
              ) : null,
            )}
            <span className="gh-timeline-cursor" style={{ left: cursorPct }} />
          </div>
        </div>
      ))}
    </div>
  );
}
