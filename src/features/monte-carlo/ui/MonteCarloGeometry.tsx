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
    <section className="mc-card mc-geometry-card" aria-label="蒙特卡洛几何结果">
      <div className="mc-card-heading">
        <div>
          <p className="eyebrow">几何机制</p>
          <h3>圆内比例与 π 的关系</h3>
        </div>
        <span>第 {frame.batch} 批</span>
      </div>
      <p>
        每个点都来自计数器使用的同一条确定性随机流。靠近原点的点位于四分之一圆内，其余点在圆外。
      </p>
      <svg
        aria-labelledby="mc-geometry-title mc-geometry-description"
        className="mc-geometry"
        role="img"
        viewBox="0 0 288 288"
      >
        <title id="mc-geometry-title">带四分之一圆和采样点的单位正方形</title>
        <desc id="mc-geometry-description">
          正方形是样本空间；四分之一圆标出计入圆内的点。圆点表示圆内点，菱形表示圆外点。
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
        当前显示本批 {batchTotal} 个点中的 {frame.points.length} 个：圆内 {shownInside} 个、圆外{" "}
        {shownOutside} 个。 整批：圆内 {frame.batchInsideCount} 个、圆外 {batchOutside} 个。累计：
        {frame.sampleCount} 个样本中有 {frame.insideCount} 个在圆内。 圆内 / 总数 ≈ 四分之一圆面积 /
        正方形面积 = π / 4。
      </p>
      <ul className="mc-geometry-legend" aria-label="点分类图例">
        <li>
          <span aria-hidden="true" className="mc-legend-mark mc-legend-inside" />
          四分之一圆内
        </li>
        <li>
          <span aria-hidden="true" className="mc-legend-mark mc-legend-outside" />
          四分之一圆外
        </li>
      </ul>
    </section>
  );
}
