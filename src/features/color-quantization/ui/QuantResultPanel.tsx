/**
 * Judge verdict display for the quantization lab: how many prints stay
 * unique, the budget usage (toner slots or mapping overrides), and the
 * counterexample pair — the query's source vs printed output next to the
 * member it merged with.
 */

import { imageFromBase64 } from "../domain/indexed.ts";
import { Icon } from "../../../shared/ui/Icon";
import { sourceCellCss, tonerCellCss } from "../domain/palette.ts";
import { TONER_RACK } from "../domain/palette.ts";
import type { PackedImage, QuantJudgeResult } from "../domain/protocol.ts";
import type { QuantStageDef } from "../domain/stages.ts";
import { PaletteCanvas } from "./PaletteCanvas.tsx";

function PackedFigure({
  packed,
  caption,
  space,
}: {
  packed: PackedImage;
  caption: string;
  space: "source" | "printed";
}) {
  const image = imageFromBase64(packed.width, packed.height, packed.b64);
  return (
    <figure>
      <PaletteCanvas
        ariaLabel={caption}
        colorOf={space === "source" ? sourceCellCss : tonerCellCss}
        image={image}
      />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export function QuantResultPanel({
  outcome,
  stage,
}: {
  outcome: QuantJudgeResult;
  stage: QuantStageDef;
}) {
  const required = Math.ceil(outcome.requiredAccuracy * outcome.total);
  const budgetLine =
    outcome.mode === "pick"
      ? `装了 ${outcome.slotsUsed} 种粉（预算 ${outcome.slotsBudget} 槽${
          outcome.withinBudget ? "" : "，已超支"
        }）`
      : `改了 ${outcome.overrides} 条默认映射（预算 ${outcome.overrideBudget} 条${
          outcome.withinBudget ? "" : "，已超支"
        }）`;
  return (
    <section
      aria-labelledby="quant-result-title"
      className={`quant-result${outcome.passed ? " is-passed" : " is-failed"}`}
    >
      <h3 id="quant-result-title">判定结果：{outcome.passed ? "通过" : "未通过"}</h3>
      <dl className="quant-verdict-stats">
        <div>
          <dt>仍能唯一认出</dt>
          <dd>
            {outcome.identified} / {outcome.total} 张
            <span className="quant-verdict-sub">（要求 ≥ {required} 张）</span>
          </dd>
        </div>
        <div>
          <dt>预算</dt>
          <dd className={outcome.withinBudget ? "" : "is-over"}>{budgetLine}</dd>
        </div>
        <div>
          <dt>用到的粉</dt>
          <dd>
            {outcome.tonersUsed.length
              ? outcome.tonersUsed.map((i) => `${i + 1}号 ${TONER_RACK[i].name}`).join("、")
              : "只有纸白"}
          </dd>
        </div>
      </dl>

      {outcome.passed ? <p className="quant-takeaway">这一关验证了：{stage.takeaway}</p> : null}

      {!outcome.passed && outcome.counterexample ? (
        <div className="quant-counterexample">
          <p className="quant-counterexample-lede">
            例子：{outcome.counterexample.query.label} 打印出来后
            {outcome.counterexample.collided
              ? `和 ${outcome.counterexample.collided.label} 完全分不开`
              : "不再唯一"}
            ——看看它们各自丢了什么颜色。
          </p>
          <div className="quant-triptych">
            <PackedFigure
              caption={`原稿 ${outcome.counterexample.query.label}`}
              packed={outcome.counterexample.query.source}
              space="source"
            />
            <span aria-hidden="true" className="quant-arrow">
              <Icon name="arrow-right" size={18} />
            </span>
            <PackedFigure
              caption={`${outcome.counterexample.query.label} 打印结果`}
              packed={outcome.counterexample.query.printed}
              space="printed"
            />
            {outcome.counterexample.collided ? (
              <>
                <span aria-hidden="true" className="quant-arrow">
                  ≡
                </span>
                <PackedFigure
                  caption={`${outcome.counterexample.collided.label} 打印结果`}
                  packed={outcome.counterexample.collided.printed}
                  space="printed"
                />
                <PackedFigure
                  caption={`原稿 ${outcome.counterexample.collided.label}`}
                  packed={outcome.counterexample.collided.source}
                  space="source"
                />
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {outcome.confusionPairs.length > 0 ? (
        <p className="quant-collisions-line">
          这次映射下还有 {outcome.confusionPairs.length} 组碰撞：
          {outcome.confusionPairs
            .slice(0, 4)
            .map((p) => `${p.aLabel}≡${p.bLabel}`)
            .join("，")}
          {outcome.confusionPairs.length > 4 ? "…" : ""}
        </p>
      ) : null}
    </section>
  );
}
