/**
 * Quantization explorer: the toner rack (pick stages) or the mapping table
 * (free stage), a gallery member strip, the source → printed preview pair,
 * and the live collision report — all evaluated against the public gallery
 * with the same rules the server uses.
 */

import { useMemo, useState } from "react";
import { publicGalleryFor } from "../domain/fixtures.ts";
import {
  PAPER,
  SOURCE_COLORS,
  TONER_RACK,
  rgbCss,
  sourceCellCss,
  tonerCellCss,
} from "../domain/palette.ts";
import { countOverrides, nnTable, quantizeImage, usedToners } from "../domain/quantize.ts";
import { confusionPairs, judgeMapping } from "../domain/recognize.ts";
import type { QuantStageDef } from "../domain/stages.ts";
import type { StageDraft } from "../lesson/state.ts";
import { PaletteCanvas } from "./PaletteCanvas.tsx";

function tonerName(index: number): string {
  return index < 0 ? "纸白" : TONER_RACK[index].name;
}

function tonerCss(index: number): string {
  return rgbCss(index < 0 ? PAPER : TONER_RACK[index].rgb);
}

/** Numbered swatch button for one rack toner. */
function TonerSwatch({
  index,
  active,
  disabled,
  onToggle,
}: {
  index: number;
  active: boolean;
  disabled: boolean;
  onToggle: (index: number) => void;
}) {
  const toner = TONER_RACK[index];
  return (
    <button
      aria-label={`${index + 1}号粉 ${toner.name}`}
      aria-pressed={active}
      className={`quant-toner${active ? " is-active" : ""}`}
      disabled={disabled}
      onClick={() => onToggle(index)}
      type="button"
    >
      <span className="quant-swatch" style={{ background: rgbCss(toner.rgb) }}>
        {index + 1}
      </span>
      <span className="quant-toner-name">{toner.name}</span>
    </button>
  );
}

export function QuantExplorer({
  stage,
  draft,
  onToners,
  onTable,
}: {
  stage: QuantStageDef;
  draft: StageDraft;
  onToners: (toners: number[]) => void;
  onTable: (table: number[]) => void;
}) {
  const gallery = useMemo(() => publicGalleryFor(stage.category), [stage.category]);
  const [memberIndex, setMemberIndex] = useState(0);
  const member = gallery[Math.min(memberIndex, gallery.length - 1)];

  const defaultTable = useMemo(
    () => (stage.fixedLoadout ? nnTable(stage.fixedLoadout) : null),
    [stage.fixedLoadout],
  );

  /** The mapping the printer would apply under the current draft. */
  const effectiveTable = useMemo(() => {
    if (stage.mode === "pick") return nnTable(draft.toners);
    return draft.table ?? defaultTable ?? [];
  }, [stage.mode, draft.toners, draft.table, defaultTable]);

  const report = useMemo(
    () => (effectiveTable.length ? judgeMapping(gallery, effectiveTable) : null),
    [gallery, effectiveTable],
  );
  const pairs = useMemo(
    () => (effectiveTable.length ? confusionPairs(gallery, effectiveTable) : []),
    [gallery, effectiveTable],
  );

  const printed = useMemo(
    () => (effectiveTable.length ? quantizeImage(member.image, effectiveTable) : member.image),
    [member, effectiveTable],
  );

  const tonersUsed = useMemo(() => usedToners(effectiveTable), [effectiveTable]);
  const overrides =
    stage.mode === "free" && draft.table && defaultTable
      ? countOverrides(draft.table, defaultTable)
      : null;

  /** Members whose prints collide, for marking the strip. */
  const collidedIds = useMemo(() => {
    const set = new Set<string>();
    if (report) {
      for (const v of report.verdicts) {
        if (!v.ok) set.add(v.queryId);
      }
    }
    return set;
  }, [report]);

  const toggleToner = (index: number) => {
    const next = draft.toners.includes(index)
      ? draft.toners.filter((i) => i !== index)
      : [...draft.toners, index];
    onToners(next);
  };

  /** Cycle one table entry through the allowed targets (free mode). */
  const cycleTarget = (srcIndex: number) => {
    if (stage.mode !== "free" || !defaultTable) return;
    const allowed = [...(stage.fixedLoadout ?? []), -1];
    const table = draft.table ?? defaultTable;
    const cur = allowed.indexOf(table[srcIndex]);
    const next = allowed[(cur + 1 + allowed.length) % allowed.length];
    const nextTable = table.slice();
    nextTable[srcIndex] = next;
    onTable(nextTable);
  };

  const overSlots = stage.mode === "pick" && tonersUsed.length > (stage.tonerSlots ?? 0);
  const overOverrides =
    stage.mode === "free" && overrides !== null && overrides > (stage.overrideBudget ?? 0);

  return (
    <section aria-labelledby="quant-explorer-title" className="quant-explorer">
      <h3 id="quant-explorer-title">
        打印实验台（公开图库 {gallery.length} 张 · {stage.category === "cadet" ? "训练" : ""}
        {stage.category === "patrol" ? "巡逻" : ""}
        {stage.category === "cargo" ? "货运" : ""}
        {stage.category === "recon" ? "侦察" : ""}机器人）
      </h3>

      {stage.mode === "pick" ? (
        <div className="quant-rack-block">
          <div className="quant-rack" role="group" aria-label="墨粉架：点击装入或取下">
            {TONER_RACK.map((_t, index) => (
              <TonerSwatch
                active={draft.toners.includes(index)}
                disabled={false}
                index={index}
                key={index}
                onToggle={toggleToner}
              />
            ))}
          </div>
          <p className={`quant-slot-note${overSlots ? " is-over" : ""}`}>
            {overSlots ? "⚠ " : ""}已装 {draft.toners.length} / {stage.tonerSlots} 槽
            {overSlots
              ? `——打印机只有 ${stage.tonerSlots} 个槽，超出的 ${draft.toners.length - stage.tonerSlots!} 种装不进去，这样提交必定失败`
              : " · 纸白永远免费"}
          </p>
          {stage.probes.length ? (
            <div className="quant-probes">
              <span>试试常见装法：</span>
              {stage.probes.map((probe) => (
                <button
                  className="quant-probe"
                  key={probe.label}
                  onClick={() => onToners(probe.toners)}
                  type="button"
                >
                  {probe.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="quant-rack-block">
          <p className="quant-slot-note">
            本关粉盒固定：
            {(stage.fixedLoadout ?? []).map((i) => `${i + 1}号 ${TONER_RACK[i].name}`).join("、")}
            ，外加免费的纸白。映射表最多可改 {stage.overrideBudget} 条默认值
            {overrides !== null ? `（当前 ${overrides} 条${overOverrides ? "，超支" : ""}）` : ""}。
          </p>
        </div>
      )}

      <div className="quant-columns">
        <div className="quant-left">
          <div aria-label="选择图库成员" className="quant-member-strip" role="listbox">
            {gallery.map((entry, index) => (
              <button
                aria-label={`查看 ${entry.label}`}
                aria-selected={index === memberIndex}
                className={`quant-member${index === memberIndex ? " is-active" : ""}${
                  collidedIds.has(entry.id) ? " is-collided" : ""
                }`}
                key={entry.id}
                onClick={() => setMemberIndex(index)}
                role="option"
                type="button"
              >
                <PaletteCanvas
                  ariaLabel={entry.label}
                  colorOf={sourceCellCss}
                  image={entry.image}
                  pixelSize={2}
                />
                <span>{entry.label}</span>
              </button>
            ))}
          </div>

          {report ? (
            <p
              className={`quant-verdict-line${report.identified === report.total ? " is-ok" : ""}`}
            >
              当前{stage.mode === "pick" ? "装法" : "映射"}下，公开图库{" "}
              <strong>
                {report.identified} / {report.total}
              </strong>{" "}
              张打印后仍可区分
              {report.identified === report.total ? " ✓" : ""}
            </p>
          ) : null}

          {pairs.length > 0 ? (
            <div className="quant-collisions" role="note">
              <strong>{pairs.length} 对成员打印后一模一样：</strong>
              <ul>
                {pairs.slice(0, 5).map((pair) => (
                  <li key={`${pair.aId}-${pair.bId}`}>
                    {pair.aLabel} ≡ {pair.bLabel}
                  </li>
                ))}
                {pairs.length > 5 ? <li>…还有 {pairs.length - 5} 对</li> : null}
              </ul>
            </div>
          ) : effectiveTable.length ? (
            <p className="quant-clear">当前映射下，公开图库里每一张都能被唯一认出。</p>
          ) : null}
        </div>

        <div className="quant-right">
          <div className="quant-preview-pair">
            <figure>
              <PaletteCanvas
                ariaLabel={`原图 ${member.label}`}
                colorOf={sourceCellCss}
                image={member.image}
              />
              <figcaption>原稿 {member.label}</figcaption>
            </figure>
            <span aria-hidden="true" className="quant-arrow">
              →
            </span>
            <figure>
              <PaletteCanvas
                ariaLabel={`${member.label} 打印结果`}
                colorOf={tonerCellCss}
                image={printed}
              />
              <figcaption>打印结果（当前映射）</figcaption>
            </figure>
          </div>

          {stage.mode === "free" && defaultTable ? (
            <table className="quant-map-table">
              <caption>映射表（点目标可循环切换；✎ = 和默认不同）</caption>
              <thead>
                <tr>
                  <th>源色</th>
                  <th>打印为</th>
                </tr>
              </thead>
              <tbody>
                {SOURCE_COLORS.map((color, i) => {
                  const target = (draft.table ?? defaultTable)[i];
                  const overridden = draft.table !== null && target !== defaultTable[i];
                  return (
                    <tr className={overridden ? "is-overridden" : ""} key={color.name}>
                      <td>
                        <span
                          className="quant-swatch is-source"
                          style={{ background: rgbCss(color.rgb) }}
                        >
                          {i + 1}
                        </span>
                        {i + 1}号 {color.name}
                      </td>
                      <td>
                        <button
                          aria-label={`${color.name} 的打印目标`}
                          className="quant-map-target"
                          onClick={() => cycleTarget(i)}
                          type="button"
                        >
                          <span className="quant-swatch" style={{ background: tonerCss(target) }}>
                            {target < 0 ? "纸" : target + 1}
                          </span>
                          {tonerName(target)}
                          {overridden ? " ✎" : ""}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </section>
  );
}
