/**
 * Quantization explorer: the toner rack (pick stages) or the mapping table
 * (free stage), a gallery member strip, the source → printed preview pair,
 * and the live collision report — all evaluated against the public gallery
 * with the same rules the server uses.
 *
 * When the student's stage-1 `nearest_toner` source exists, a preview-rule
 * toggle (pick stages) runs it over every source color against the loaded
 * cartridges to derive the effective mapping table — so the rule they
 * wrote literally produces the print the receiver sees. Collisions name
 * the merged feature: which part's colors folded into one toner.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../shared/ui/Icon";
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
import { mergedParts, PART_LABELS, type MergedPart } from "../domain/sprites.ts";
import type { QuantStageDef } from "../domain/stages.ts";
import type { StageDraft } from "../lesson/state.ts";
import { PaletteCanvas } from "./PaletteCanvas.tsx";
import { runNearestToner } from "./pyodideRunner.ts";

function tonerName(index: number): string {
  return index < 0 ? "纸白" : TONER_RACK[index].name;
}

function tonerCss(index: number): string {
  return rgbCss(index < 0 ? PAPER : TONER_RACK[index].rgb);
}

/** "耳：violet 和 wine 都印成 magenta" — one merged feature, human-readable. */
function mergedPartText(m: MergedPart): string {
  const a = SOURCE_COLORS[m.aIndex - 1]?.name ?? `#${m.aIndex}`;
  const b = SOURCE_COLORS[m.bIndex - 1]?.name ?? `#${m.bIndex}`;
  return `${PART_LABELS[m.part]}：${a}(${m.aIndex}号) 和 ${b}(${m.bIndex}号) 都印成了 ${tonerName(m.target)}`;
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
  ruleCode,
}: {
  stage: QuantStageDef;
  draft: StageDraft;
  onToners: (toners: number[]) => void;
  onTable: (table: number[]) => void;
  /** Student's stage-1 nearest_toner source; enables the "用我的规则" preview. */
  ruleCode?: string;
}) {
  const gallery = useMemo(() => publicGalleryFor(stage.category), [stage.category]);
  const [memberIndex, setMemberIndex] = useState(0);
  const member = gallery[Math.min(memberIndex, gallery.length - 1)];
  const [inspectedPairId, setInspectedPairId] = useState<string | null>(null);
  const [useMyRule, setUseMyRule] = useState(false);
  const [myTable, setMyTable] = useState<number[] | null>(null);
  const [myError, setMyError] = useState<string | null>(null);
  const [myRunning, setMyRunning] = useState(false);
  const runSeq = useRef(0);

  const defaultTable = useMemo(
    () => (stage.fixedLoadout ? nnTable(stage.fixedLoadout) : null),
    [stage.fixedLoadout],
  );

  /** The mapping the printer would apply under the current draft. */
  const builtinTable = useMemo(() => {
    if (stage.mode === "pick") return nnTable(draft.toners);
    return draft.table ?? defaultTable ?? [];
  }, [stage.mode, draft.toners, draft.table, defaultTable]);

  // Pick stages: run the student's nearest_toner over the source palette
  // against the loaded cartridges to derive the mapping table they wrote.
  useEffect(() => {
    if (stage.mode !== "pick" || !useMyRule || !ruleCode?.trim()) {
      setMyTable(null);
      setMyError(null);
      return;
    }
    const candidates = [PAPER, ...draft.toners.map((i) => TONER_RACK[i].rgb)];
    const seq = (runSeq.current += 1);
    setMyRunning(true);
    const timer = setTimeout(() => {
      void runNearestToner(
        ruleCode,
        SOURCE_COLORS.map((c) => [...c.rgb]),
        candidates.map((c) => [...c]),
      )
        .then((results) => {
          if (runSeq.current !== seq) return;
          const table: number[] = [];
          const bad: string[] = [];
          results.forEach((raw, i) => {
            const v = Number(raw);
            if (Number.isInteger(v) && v >= 0 && v < candidates.length) {
              table[i] = v === 0 ? -1 : draft.toners[v - 1];
            } else {
              table[i] = -1;
              if (bad.length < 3) {
                bad.push(
                  `${i + 1}号 ${SOURCE_COLORS[i].name} 返回了 ${raw === null ? "None" : JSON.stringify(raw)}`,
                );
              }
            }
          });
          setMyTable(table);
          setMyError(
            bad.length
              ? `nearest_toner 必须返回候选编号（0=纸白, 1..${candidates.length - 1}=已装的粉）——${bad.join("；")}，已按纸白处理。`
              : null,
          );
        })
        .catch((err: unknown) => {
          if (runSeq.current !== seq) return;
          setMyTable(null);
          setMyError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (runSeq.current === seq) setMyRunning(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [stage.mode, useMyRule, ruleCode, draft.toners]);

  const effectiveTable = stage.mode === "pick" && useMyRule && myTable ? myTable : builtinTable;

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

  /** A clicked collision pair: member A shown, merged parts listed. */
  const inspectedPair = useMemo(() => {
    if (!inspectedPairId || !effectiveTable.length) return null;
    const pair = pairs.find((p) => `${p.aId}-${p.bId}` === inspectedPairId);
    if (!pair) return null;
    const a = gallery.find((e) => e.id === pair.aId);
    const b = gallery.find((e) => e.id === pair.bId);
    if (!a || !b) return null;
    return { pair, merged: mergedParts(a.parts, b.parts, effectiveTable) };
  }, [inspectedPairId, pairs, gallery, effectiveTable]);

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

  const inspectPair = (pairKey: string, aId: string) => {
    const index = gallery.findIndex((e) => e.id === aId);
    if (index >= 0) setMemberIndex(index);
    setInspectedPairId(pairKey);
  };

  const overSlots = stage.mode === "pick" && tonersUsed.length > (stage.tonerSlots ?? 0);
  const overOverrides =
    stage.mode === "free" && overrides !== null && overrides > (stage.overrideBudget ?? 0);

  return (
    <section aria-labelledby="quant-explorer-title" className="quant-explorer">
      <h3 id="quant-explorer-title">
        印刷实验台（公开图谱 {gallery.length} 张 · {stage.category === "cadet" ? "学员" : ""}
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
            {overSlots ? <Icon name="warning" size={13} /> : null}已装 {draft.toners.length} /{" "}
            {stage.tonerSlots} 槽
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

          {ruleCode?.trim() ? (
            <div aria-label="印刷使用的映射规则" className="quant-rule-toggle" role="group">
              <span>映射规则：</span>
              <button
                aria-pressed={!useMyRule}
                className={!useMyRule ? "is-active" : ""}
                onClick={() => setUseMyRule(false)}
                type="button"
              >
                内置最近色
              </button>
              <button
                aria-pressed={useMyRule}
                className={useMyRule ? "is-active" : ""}
                onClick={() => setUseMyRule(true)}
                type="button"
              >
                我写的 nearest_toner
              </button>
              {myRunning ? <span className="quant-rule-running">运行中…</span> : null}
            </div>
          ) : null}
          {useMyRule && myError ? (
            <p className="quant-rule-error" role="alert">
              {myError}
              {myTable ? "" : "（预览暂用内置规则）"}
            </p>
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
          <div aria-label="选择要印的原稿" className="quant-member-strip" role="listbox">
            {gallery.map((entry, index) => (
              <button
                aria-label={`查看 ${entry.label}`}
                aria-selected={index === memberIndex}
                className={`quant-member${index === memberIndex ? " is-active" : ""}${
                  collidedIds.has(entry.id) ? " is-collided" : ""
                }`}
                key={entry.id}
                onClick={() => {
                  setMemberIndex(index);
                  setInspectedPairId(null);
                }}
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
              当前{stage.mode === "pick" ? "装法" : "映射"}下，接收端还能认出{" "}
              <strong>
                {report.identified} / {report.total}
              </strong>{" "}
              张{report.identified === report.total ? <Icon name="check" size={13} /> : null}
            </p>
          ) : null}

          {pairs.length > 0 ? (
            <div className="quant-collisions" role="note">
              <strong>接收端会分不清这 {pairs.length} 对：</strong>
              <ul>
                {pairs.slice(0, 5).map((pair) => {
                  const key = `${pair.aId}-${pair.bId}`;
                  return (
                    <li key={key}>
                      <button
                        className={`quant-pair-link${inspectedPairId === key ? " is-active" : ""}`}
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
                inspectedPair.merged.length ? (
                  <ul className="quant-merged-list">
                    {inspectedPair.merged.map((m) => (
                      <li key={m.part}>{mergedPartText(m)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="quant-merged-note">两台机器人原稿完全相同。</p>
                )
              ) : (
                <p className="quant-merged-note">点一对，看是哪个部件的颜色被合并了。</p>
              )}
            </div>
          ) : effectiveTable.length ? (
            <p className="quant-clear">当前映射下，图谱里每一张接收端都能认出。</p>
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
              <figcaption>发送原稿 {member.label}</figcaption>
            </figure>
            <span aria-hidden="true" className="quant-arrow">
              <Icon name="arrow-right" size={18} />
            </span>
            <figure>
              <PaletteCanvas
                ariaLabel={`${member.label} 印出结果`}
                colorOf={tonerCellCss}
                image={printed}
              />
              <figcaption>
                接收端所见{useMyRule && stage.mode === "pick" ? "（你的规则）" : ""}
              </figcaption>
            </figure>
          </div>

          {stage.mode === "free" && defaultTable ? (
            <table className="quant-map-table">
              <caption>映射表（点目标可循环切换；✎ = 和默认不同）</caption>
              <thead>
                <tr>
                  <th>源色</th>
                  <th>印为</th>
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
