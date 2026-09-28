/**
 * Single-variable env chart: the env curve over the run, the green target
 * band from the case's `inBand`, and the ambient anchors drawn dashed so
 * students see the forcing their rules are fighting.
 */

import { SENSOR_LABEL, fmtFixed, type SensorId } from "../domain/model.ts";
import type { SimRun } from "../domain/simulate.ts";

const W = 640;
const H = 168;
const PAD_X = 34;
const PAD_Y = 16;

export function EnvChart(props: {
  run: SimRun;
  sensor: SensorId;
  band: [number, number] | null;
  cursor: number;
  onScrub?: (t: number) => void;
}) {
  const { run, sensor, band, cursor, onScrub } = props;
  const ticks = run.trace.length;
  if (ticks === 0) return null;

  const envVals = run.trace.map((r) => r.env[sensor]);
  const ambVals = run.trace.map((r) => r.amb[sensor]);
  // Unanchored vars mirror env in `amb` — only draw the dashed line when
  // the scenario actually forces this variable.
  const showAmb = run.trace.some((r) => r.amb[sensor] !== r.env[sensor]);

  const pool = [...envVals, ...(showAmb ? ambVals : []), ...(band ?? [])];
  let lo = Math.min(...pool);
  let hi = Math.max(...pool);
  if (lo === hi) {
    lo -= 10;
    hi += 10;
  }
  const pad = Math.max(4, Math.trunc((hi - lo) * 0.08));
  lo -= pad;
  hi += pad;

  const x = (t: number) => PAD_X + (t / Math.max(1, ticks - 1)) * (W - PAD_X * 2);
  const y = (v: number) => PAD_Y + ((hi - v) / (hi - lo)) * (H - PAD_Y * 2);
  const line = (vals: number[]) =>
    vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const cursorX = x(Math.min(cursor, ticks - 1));
  const yTicks = [
    lo + Math.trunc((hi - lo) / 4),
    lo + Math.trunc((hi - lo) / 2),
    hi - Math.trunc((hi - lo) / 4),
  ];

  return (
    <figure className="gh-chart" aria-label={`${SENSOR_LABEL[sensor]}曲线`}>
      <svg
        onClick={(e) => {
          if (!onScrub) return;
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const fx = (e.clientX - rect.left) / rect.width;
          const t = Math.round((fx * W - PAD_X) / ((W - PAD_X * 2) / Math.max(1, ticks - 1)));
          onScrub(Math.min(Math.max(t, 0), ticks - 1));
        }}
        viewBox={`0 0 ${W} ${H}`}
      >
        {band ? (
          <rect
            className="gh-band"
            height={Math.max(2, y(band[0]) - y(band[1]))}
            width={W - PAD_X * 2}
            x={PAD_X}
            y={y(band[1])}
          />
        ) : null}
        {yTicks.map((v) => (
          <g key={v}>
            <line className="gh-grid" x1={PAD_X} x2={W - PAD_X} y1={y(v)} y2={y(v)} />
            <text className="gh-axis-label" textAnchor="end" x={PAD_X - 4} y={y(v) + 3}>
              {fmtFixed(v)}
            </text>
          </g>
        ))}
        {showAmb ? <polyline className="gh-ambient" points={line(ambVals)} /> : null}
        <polyline className="gh-env" points={line(envVals)} />
        <line className="gh-cursor" x1={cursorX} x2={cursorX} y1={PAD_Y - 6} y2={H - PAD_Y + 4} />
        <circle
          className="gh-cursor-dot"
          cx={cursorX}
          cy={y(envVals[Math.min(cursor, ticks - 1)])}
          r={3.5}
        />
      </svg>
      <figcaption>
        <span className="gh-legend gh-legend-env">棚内{SENSOR_LABEL[sensor]}</span>
        {showAmb ? <span className="gh-legend gh-legend-amb">外界</span> : null}
        {band ? (
          <span className="gh-legend gh-legend-band">
            目标 {fmtFixed(band[0])}–{fmtFixed(band[1])}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
