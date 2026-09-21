/**
 * Downsample explorer: pick a gallery member and a resolution, watch the
 * compressed grid, zoom into one cell's source region, and scan the
 * resolution sweep table — all against the public gallery.
 */

import { useMemo, useState } from "react";
import { cellBounds, cellRegion, cellStats, type Resolution } from "../domain/downsample.ts";
import { downsample } from "../domain/downsample.ts";
import { publicGalleryFor } from "../domain/fixtures.ts";
import { confusionPairs, judgeResolution } from "../domain/recognize.ts";
import type { SamplingStageDef } from "../domain/stages.ts";
import type { CellPick } from "../lesson/state.ts";
import { BitmapCanvas } from "./BitmapCanvas.tsx";

type ExplorerProps = {
  stage: SamplingStageDef;
  width: number;
  height: number;
  selectedCell: CellPick | null;
  onResolution: (width: number, height: number) => void;
  onCellPick: (cell: CellPick | null) => void;
};

function ResolutionInputs({
  stage,
  width,
  height,
  onResolution,
}: Pick<ExplorerProps, "stage" | "width" | "height" | "onResolution">) {
  const setDim = (dim: "w" | "h", raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    if (stage.mode === "square") onResolution(n, n);
    else onResolution(dim === "w" ? n : width, dim === "h" ? n : height);
  };
  return (
    <div className="resolution-inputs">
      {stage.mode === "square" ? (
        <label>
          n × n
          <input
            aria-label="正方形边长 n"
            max={64}
            min={2}
            onChange={(e) => setDim("w", e.target.value)}
            type="number"
            value={width}
          />
        </label>
      ) : (
        <>
          <label>
            宽
            <input
              aria-label="宽度（列数）"
              max={64}
              min={2}
              onChange={(e) => setDim("w", e.target.value)}
              type="number"
              value={width}
            />
          </label>
          <span aria-hidden="true">×</span>
          <label>
            高
            <input
              aria-label="高度（行数）"
              max={64}
              min={2}
              onChange={(e) => setDim("h", e.target.value)}
              type="number"
              value={height}
            />
          </label>
        </>
      )}
      <span className="cell-count">{width * height} 个格子</span>
    </div>
  );
}

export function DownsampleExplorer({
  stage,
  width,
  height,
  selectedCell,
  onResolution,
  onCellPick,
}: ExplorerProps) {
  const gallery = useMemo(() => publicGalleryFor(stage.category), [stage.category]);
  const [memberIndex, setMemberIndex] = useState(0);
  const member = gallery[Math.min(memberIndex, gallery.length - 1)];

  const compressed = useMemo(
    () => downsample(member.image, width, height),
    [member, width, height],
  );

  const sweep = useMemo(
    () =>
      stage.probes.map((probe: Resolution) => {
        const report = judgeResolution(gallery, gallery, probe.width, probe.height);
        return { ...probe, cells: probe.width * probe.height, report };
      }),
    [stage, gallery],
  );

  const pairs = useMemo(() => confusionPairs(gallery, width, height), [gallery, width, height]);

  const inspection = useMemo(() => {
    if (!selectedCell) return null;
    const bounds = cellBounds(
      member.image.width,
      member.image.height,
      width,
      height,
      selectedCell.cx,
      selectedCell.cy,
    );
    const { on, total } = cellStats(member.image, width, height, selectedCell.cx, selectedCell.cy);
    const region = cellRegion(member.image, width, height, selectedCell.cx, selectedCell.cy);
    return {
      bounds,
      on,
      total,
      region,
      output: compressed.cells[selectedCell.cy * width + selectedCell.cx],
    };
  }, [member, width, height, selectedCell, compressed]);

  const previewRes = useMemo(() => ({ width, height }), [width, height]);

  return (
    <section aria-labelledby="explorer-title" className="downsample-explorer">
      <h3 id="explorer-title">分辨率实验台（公开图库 {gallery.length} 张）</h3>

      <ResolutionInputs height={height} onResolution={onResolution} stage={stage} width={width} />

      <div className="explorer-columns">
        <div className="explorer-left">
          <div aria-label="选择图库成员" className="member-strip" role="listbox">
            {gallery.map((entry, index) => (
              <button
                aria-label={`查看 ${entry.label}`}
                aria-selected={index === memberIndex}
                className={`member-chip${index === memberIndex ? " is-active" : ""}`}
                key={entry.id}
                onClick={() => {
                  setMemberIndex(index);
                  onCellPick(null);
                }}
                role="option"
                type="button"
              >
                <BitmapCanvas ariaLabel={entry.label} image={entry.image} pixelSize={2} />
                <span>{entry.label}</span>
              </button>
            ))}
          </div>

          <table className="sweep-table">
            <caption>扫掠表：这个图库在各分辨率下有多少成员仍然独一无二</caption>
            <thead>
              <tr>
                <th>分辨率</th>
                <th>格子数</th>
                <th>可区分</th>
              </tr>
            </thead>
            <tbody>
              {sweep.map((row) => {
                const active = row.width === width && row.height === height;
                return (
                  <tr className={active ? "is-active" : ""} key={`${row.width}x${row.height}`}>
                    <td>
                      <button
                        className="probe-link"
                        onClick={() =>
                          onResolution(row.width, stage.mode === "square" ? row.width : row.height)
                        }
                        type="button"
                      >
                        {row.width}×{row.height}
                      </button>
                    </td>
                    <td>{row.cells}</td>
                    <td>
                      {row.report.identified} / {row.report.total}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {pairs.length > 0 ? (
            <div className="confusion-callout" role="note">
              <strong>
                在 {previewRes.width}×{previewRes.height} 下有 {pairs.length} 对图变得一模一样：
              </strong>
              <ul>
                {pairs.slice(0, 5).map((pair) => (
                  <li key={`${pair.aId}-${pair.bId}`}>
                    {pair.aLabel} ≡ {pair.bLabel}
                  </li>
                ))}
                {pairs.length > 5 ? <li>…还有 {pairs.length - 5} 对</li> : null}
              </ul>
            </div>
          ) : (
            <p className="confusion-clear">当前分辨率下，公开图库里每一张都能被唯一认出。</p>
          )}
        </div>

        <div className="explorer-right">
          <div className="preview-pair">
            <figure>
              <BitmapCanvas
                ariaLabel={`原图 ${member.label}`}
                image={member.image}
                region={inspection?.bounds ?? null}
              />
              <figcaption>
                原图 {member.label} · {member.image.width}×{member.image.height}
              </figcaption>
            </figure>
            <span aria-hidden="true" className="preview-arrow">
              →
            </span>
            <figure>
              <BitmapCanvas
                ariaLabel={`${width}×${height} 压缩结果`}
                grid
                highlight={selectedCell}
                image={compressed}
                onCellClick={(cx, cy) =>
                  onCellPick(
                    selectedCell && selectedCell.cx === cx && selectedCell.cy === cy
                      ? null
                      : { cx, cy },
                  )
                }
              />
              <figcaption>
                压缩后 {width}×{height}（点一个格子看它怎么决定）
              </figcaption>
            </figure>
          </div>

          {inspection ? (
            <div className="cell-inspector" role="status">
              <strong>
                格子 ({selectedCell!.cx}, {selectedCell!.cy})：
              </strong>
              覆盖原图区域 x∈[{inspection.bounds.x0}, {inspection.bounds.x1}), y∈[
              {inspection.bounds.y0}, {inspection.bounds.y1})，共 {inspection.total} 个像素， 其中{" "}
              {inspection.on} 个是图形 → {Math.round((inspection.on / inspection.total) * 100)}% ≥
              50% → 输出 <strong>{inspection.output}</strong>
            </div>
          ) : (
            <p className="cell-inspector-hint">点击右侧压缩图里的格子，看它在原图里对应哪一块。</p>
          )}
        </div>
      </div>
    </section>
  );
}
