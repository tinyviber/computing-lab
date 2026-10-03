/**
 * Downsample explorer: pick a signal card, inspect what the receiver sees,
 * zoom into one cell's source region, and scan the resolution sweep table —
 * all against the public atlas. Code-driven stages get their resolution from
 * the choose_size panel instead of this explorer.
 *
 * When the student's stage-1 `cell_value` source exists, a preview-rule
 * toggle runs it over every cell of the displayed member, so the rule they
 * wrote is literally what produces the received image (the built-in
 * majority rule stays the fallback and is labelled as such).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ScenarioLinkButton } from "../../../shared/lab/ScenarioLinkButton";
import { Icon } from "../../../shared/ui/Icon";
import { diffBounds, makeImage, type BinaryImage } from "../domain/bitmap.ts";
import { cellBounds, cellRegion, cellStats, type Resolution } from "../domain/downsample.ts";
import { downsample } from "../domain/downsample.ts";
import { publicGalleryFor } from "../domain/fixtures.ts";
import { confusionPairs, judgeResolution } from "../domain/recognize.ts";
import { SOURCE_SIZE } from "../domain/sprites.ts";
import type { SamplingStageDef } from "../domain/stages.ts";
import type { CellPick } from "../lesson/state.ts";
import { BitmapCanvas } from "./BitmapCanvas.tsx";
import { runCellValue } from "./pyodideRunner.ts";

type ExplorerProps = {
  stage: SamplingStageDef;
  width: number;
  height: number;
  /** Whether choose_size has produced the current preview resolution. */
  resolutionReady: boolean;
  selectedCell: CellPick | null;
  onResolution: (width: number, height: number) => void;
  onCellPick: (cell: CellPick | null) => void;
  /** Student's stage-1 cell_value source; enables the "用我的规则" preview. */
  ruleCode?: string;
  /** When provided, renders a share-link button (staff only). */
  shareSearch?: Record<string, string | number>;
};

function ResolutionInputs({
  stage,
  width,
  height,
  resolutionReady,
  onResolution,
}: Pick<ExplorerProps, "stage" | "width" | "height" | "onResolution" | "resolutionReady">) {
  if (stage.requiresChooseSize) {
    return (
      <div className="resolution-inputs resolution-code-status" role="status">
        <strong>分辨率由 choose_size(images) 决定</strong>
        <span>
          {resolutionReady
            ? `当前结果：${width} × ${height}（${width * height} 个格子）`
            : "先运行下方代码，生成本关的分辨率。"}
        </span>
      </div>
    );
  }

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
      <span className="cell-count">
        {SOURCE_SIZE * SOURCE_SIZE} 个位置 → {width * height} 个格子（保留{" "}
        {((width * height * 100) / (SOURCE_SIZE * SOURCE_SIZE)).toFixed(1)}%）
      </span>
    </div>
  );
}

/** Every target cell of member.image at (w,h) as a 2D region list. */
function allRegions(image: BinaryImage, width: number, height: number): number[][][] {
  const regions: number[][][] = [];
  for (let cy = 0; cy < height; cy += 1) {
    for (let cx = 0; cx < width; cx += 1) {
      regions.push(cellRegion(image, width, height, cx, cy));
    }
  }
  return regions;
}

export function DownsampleExplorer({
  stage,
  width,
  height,
  selectedCell,
  onResolution,
  onCellPick,
  resolutionReady,
  ruleCode,
  shareSearch,
}: ExplorerProps) {
  const gallery = useMemo(() => publicGalleryFor(stage.category), [stage.category]);
  const [memberIndex, setMemberIndex] = useState(0);
  const member = gallery[Math.min(memberIndex, gallery.length - 1)];
  const [inspectedPairId, setInspectedPairId] = useState<string | null>(null);
  const [useMyRule, setUseMyRule] = useState(false);
  const [myGrid, setMyGrid] = useState<BinaryImage | null>(null);
  const [myRuleError, setMyRuleError] = useState<string | null>(null);
  const [myRuleRunning, setMyRuleRunning] = useState(false);
  const runSeq = useRef(0);

  const builtinCompressed = useMemo(
    () => downsample(member.image, width, height),
    [member, width, height],
  );

  // Run the student's cell_value over every cell of the displayed member.
  useEffect(() => {
    if (stage.requiresChooseSize || !useMyRule || !ruleCode?.trim()) {
      runSeq.current += 1;
      setMyGrid(null);
      setMyRuleError(null);
      return;
    }
    const seq = (runSeq.current += 1);
    setMyRuleRunning(true);
    const timer = setTimeout(() => {
      void runCellValue(ruleCode, allRegions(member.image, width, height))
        .then((results) => {
          if (runSeq.current !== seq) return;
          const grid = makeImage(width, height);
          const bad: string[] = [];
          for (let i = 0; i < results.length && i < width * height; i += 1) {
            const v = Number(results[i]);
            if (v === 0 || v === 1) {
              grid.cells[i] = v;
            } else {
              const cx = i % width;
              const cy = (i / width) | 0;
              if (bad.length < 3) {
                bad.push(
                  `(${cx},${cy}) 返回了 ${results[i] === null ? "None" : JSON.stringify(results[i])}`,
                );
              }
            }
          }
          setMyGrid(grid);
          setMyRuleError(
            bad.length
              ? `cell_value 必须返回 0 或 1——格子 ${bad.join("、")} 的返回值无效，已按 0 画出。`
              : null,
          );
        })
        .catch((err: unknown) => {
          if (runSeq.current !== seq) return;
          setMyGrid(null);
          setMyRuleError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (runSeq.current === seq) setMyRuleRunning(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [stage.requiresChooseSize, useMyRule, ruleCode, member, width, height]);

  const compressed = !stage.requiresChooseSize && useMyRule && myGrid ? myGrid : builtinCompressed;

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

  /** A clicked confusion pair: member A shown, diff bbox outlined on the source. */
  const inspectedPair = useMemo(() => {
    if (!inspectedPairId) return null;
    const pair = pairs.find((p) => `${p.aId}-${p.bId}` === inspectedPairId);
    if (!pair) return null;
    const a = gallery.find((e) => e.id === pair.aId);
    const b = gallery.find((e) => e.id === pair.bId);
    if (!a || !b) return null;
    return { pair, a, b, bounds: diffBounds(a.image, b.image) };
  }, [inspectedPairId, pairs, gallery]);

  const sourceRegion = inspectedPair?.bounds ?? inspection?.bounds ?? null;

  const pickMember = (index: number) => {
    setMemberIndex(index);
    setInspectedPairId(null);
    onCellPick(null);
  };

  const inspectPair = (pairKey: string, aId: string) => {
    const index = gallery.findIndex((e) => e.id === aId);
    if (index >= 0) setMemberIndex(index);
    setInspectedPairId(pairKey);
    onCellPick(null);
  };

  return (
    <section aria-labelledby="explorer-title" className="downsample-explorer">
      <h3 id="explorer-title">发信实验台（公开图谱 {gallery.length} 张）</h3>
      {shareSearch ? <ScenarioLinkButton search={shareSearch} /> : null}

      <ResolutionInputs
        height={height}
        onResolution={onResolution}
        resolutionReady={resolutionReady}
        stage={stage}
        width={width}
      />

      {!stage.requiresChooseSize && ruleCode?.trim() ? (
        <div aria-label="预览使用的规则" className="rule-toggle" role="group">
          <span>接收端规则：</span>
          <button
            aria-pressed={!useMyRule}
            className={!useMyRule ? "is-active" : ""}
            onClick={() => setUseMyRule(false)}
            type="button"
          >
            内置多数规则
          </button>
          <button
            aria-pressed={useMyRule}
            className={useMyRule ? "is-active" : ""}
            onClick={() => setUseMyRule(true)}
            type="button"
          >
            我写的 cell_value
          </button>
          {myRuleRunning ? <span className="rule-running">运行中…</span> : null}
        </div>
      ) : null}
      {useMyRule && myRuleError ? (
        <p className="rule-error" role="alert">
          {myRuleError}
          {myGrid ? "" : "（预览暂用内置规则）"}
        </p>
      ) : null}

      <div className="explorer-columns">
        <div className="explorer-left">
          <div aria-label="选择要发送的信号" className="member-strip" role="listbox">
            {gallery.map((entry, index) => (
              <button
                aria-label={`查看 ${entry.label}`}
                aria-selected={index === memberIndex}
                className={`member-chip${index === memberIndex ? " is-active" : ""}`}
                key={entry.id}
                onClick={() => pickMember(index)}
                role="option"
                type="button"
              >
                <BitmapCanvas ariaLabel={entry.label} image={entry.image} pixelSize={2} />
                <span>{entry.label}</span>
              </button>
            ))}
          </div>

          <table className="sweep-table">
            <caption>扫掠表：这组信号在各分辨率下，接收端还能分清多少张</caption>
            <thead>
              <tr>
                <th>分辨率</th>
                <th>格子数</th>
                <th>可辨认</th>
              </tr>
            </thead>
            <tbody>
              {sweep.map((row) => {
                const active = row.width === width && row.height === height;
                return (
                  <tr className={active ? "is-active" : ""} key={`${row.width}x${row.height}`}>
                    <td>
                      {stage.requiresChooseSize ? (
                        <span>
                          {row.width}×{row.height}
                        </span>
                      ) : (
                        <button
                          className="probe-link"
                          onClick={() =>
                            onResolution(
                              row.width,
                              stage.mode === "square" ? row.width : row.height,
                            )
                          }
                          type="button"
                        >
                          {row.width}×{row.height}
                        </button>
                      )}
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
                在 {width}×{height} 下接收端会分不清这 {pairs.length} 对：
              </strong>
              <ul>
                {pairs.slice(0, 5).map((pair) => {
                  const key = `${pair.aId}-${pair.bId}`;
                  return (
                    <li key={key}>
                      <button
                        className={`pair-link${inspectedPairId === key ? " is-active" : ""}`}
                        onClick={() => inspectPair(key, pair.aId)}
                        type="button"
                      >
                        {pair.aLabel} ≡ {pair.bLabel}
                      </button>
                    </li>
                  );
                })}
                {pairs.length > 5 ? <li>…还有 {pairs.length - 5} 对</li> : null}
              </ul>
              {inspectedPair ? (
                <p className="pair-diff-note">
                  {inspectedPair.bounds
                    ? `${inspectedPair.pair.aLabel} 与 ${inspectedPair.pair.bLabel} 的差别只在原图 x∈[${inspectedPair.bounds.x0}, ${inspectedPair.bounds.x1})、y∈[${inspectedPair.bounds.y0}, ${inspectedPair.bounds.y1}) 的 ${inspectedPair.bounds.pixels} 个像素里（原图上的虚线框）——当前网格把它抹平了。`
                    : `${inspectedPair.pair.aLabel} 与 ${inspectedPair.pair.bLabel} 原图完全相同。`}
                </p>
              ) : (
                <p className="pair-diff-note">点一对，看它们的差别被哪个区域的格子抹掉了。</p>
              )}
            </div>
          ) : (
            <p className="confusion-clear">当前分辨率下，图谱里每一张接收端都能认出。</p>
          )}
        </div>

        <div className="explorer-right">
          <div className="preview-pair">
            <figure>
              <BitmapCanvas
                ariaLabel={`原图 ${member.label}`}
                image={member.image}
                region={sourceRegion}
              />
              <figcaption>
                发送端原图 {member.label} · {member.image.width}×{member.image.height}
              </figcaption>
            </figure>
            <span aria-hidden="true" className="preview-arrow">
              <Icon name="arrow-right" size={18} />
            </span>
            <figure>
              <BitmapCanvas
                ariaLabel={`接收端看到的 ${width}×${height} 格子图`}
                grid
                highlight={selectedCell}
                image={compressed}
                onCellClick={(cx, cy) => {
                  setInspectedPairId(null);
                  onCellPick(
                    selectedCell && selectedCell.cx === cx && selectedCell.cy === cy
                      ? null
                      : { cx, cy },
                  );
                }}
              />
              <figcaption>
                接收端所见 {width}×{height}
                {useMyRule ? "（你的规则）" : ""}（点一个格子看它怎么决定）
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
              50% → 收到 <strong>{inspection.output}</strong>
            </div>
          ) : (
            <p className="cell-inspector-hint">点接收端图里的格子，看它盖住了原图的哪一块。</p>
          )}
        </div>
      </div>
    </section>
  );
}
