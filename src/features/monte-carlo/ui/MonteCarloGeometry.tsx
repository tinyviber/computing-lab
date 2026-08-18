import type { MonteCarloFrame } from "../domain";

const SIZE = 240;
const ORIGIN = 24;
const BASELINE = ORIGIN + SIZE;

function pointX(value: number): number {
  return ORIGIN + value * SIZE;
}

function pointY(value: number): number {
  return BASELINE - value * SIZE;
}

export function MonteCarloGeometry({ frame }: { frame: MonteCarloFrame }) {
  const shownInside = frame.points.filter((point) => point.inside).length;
  const shownOutside = frame.points.length - shownInside;
  const batchTotal = frame.sampleCount - frame.before.samplesDrawn;
  const batchOutside = batchTotal - frame.batchInsideCount;

  return (
    <section className="mc-card mc-geometry-card" aria-label="Monte Carlo geometry evidence">
      <div className="mc-card-heading">
        <div>
          <p className="eyebrow">GEOMETRIC MECHANISM</p>
          <h3>Why inside ÷ total estimates π ÷ 4</h3>
        </div>
        <span>batch {frame.batch}</span>
      </div>
      <p>
        Each point comes from the same deterministic stream used by the counters. Points near the
        origin lie inside the quarter circle; the rest lie outside.
      </p>
      <svg
        aria-labelledby="mc-geometry-title mc-geometry-description"
        className="mc-geometry"
        role="img"
        viewBox="0 0 288 288"
      >
        <title id="mc-geometry-title">Unit square with quarter circle and sampled points</title>
        <desc id="mc-geometry-description">
          The square is the sample space. A quarter circle marks points counted as inside. Circles
          are inside points and diamonds are outside points.
        </desc>
        <rect
          className="mc-geometry-square"
          data-monte-carlo-square="true"
          height={SIZE}
          width={SIZE}
          x={ORIGIN}
          y={ORIGIN}
        />
        <line
          className="mc-geometry-axis"
          data-monte-carlo-axis="true"
          x1={ORIGIN}
          x2={ORIGIN}
          y1={ORIGIN}
          y2={BASELINE}
        />
        <line
          className="mc-geometry-axis"
          data-monte-carlo-axis="true"
          x1={ORIGIN}
          x2={BASELINE}
          y1={BASELINE}
          y2={BASELINE}
        />
        <path
          className="mc-geometry-boundary"
          d={`M ${ORIGIN} ${ORIGIN} A ${SIZE} ${SIZE} 0 0 1 ${BASELINE} ${BASELINE}`}
          data-monte-carlo-boundary="true"
        />
        {frame.points.map((point) => {
          const x = pointX(point.x);
          const y = pointY(point.y);
          return point.inside ? (
            <circle
              className="mc-geometry-point mc-geometry-point-inside"
              data-monte-carlo-point="inside"
              key={point.sampleIndex}
              r="2.4"
              cx={x}
              cy={y}
            />
          ) : (
            <rect
              className="mc-geometry-point mc-geometry-point-outside"
              data-monte-carlo-point="outside"
              height="4.8"
              key={point.sampleIndex}
              transform={`rotate(45 ${x} ${y})`}
              width="4.8"
              x={x - 2.4}
              y={y - 2.4}
            />
          );
        })}
      </svg>
      <p className="mc-geometry-summary">
        Showing {frame.points.length} of {batchTotal} points in this batch: {shownInside} inside and{" "}
        {shownOutside} outside. Full batch: {frame.batchInsideCount} inside and {batchOutside}{" "}
        outside. Cumulative: {frame.insideCount} inside of {frame.sampleCount}. Inside / total ≈
        quarter-circle area / square area = π / 4.
      </p>
      <ul className="mc-geometry-legend" aria-label="Point classification legend">
        <li>
          <span aria-hidden="true" className="mc-legend-mark mc-legend-inside" />
          Inside quarter circle
        </li>
        <li>
          <span aria-hidden="true" className="mc-legend-mark mc-legend-outside" />
          Outside quarter circle
        </li>
      </ul>
    </section>
  );
}
