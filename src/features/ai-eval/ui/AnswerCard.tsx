/**
 * One drawn answer: text rendered with `⟦i⟧` placeholders swapped for slot
 * chips. In C3 the chips are the verify affordance — click to spend quota
 * and reveal the fact-table truth underneath.
 */

import { SLOT_LABELS, type SlotKey } from "../domain/corpus.ts";
import type { DrawPayload } from "../domain/protocol.ts";

export type VerifiedField = { truth: string | null };

const MARK = /⟦(\d+)⟧/g;

export function AnswerCard(props: {
  draw: DrawPayload;
  /** Collect toggle for the transcript (stages 1–2). */
  collected?: boolean;
  onCollect?: (drawId: string, collect: boolean) => void;
  /** Verify affordance (stage 3): click a slot chip to check the fact table. */
  verified?: Record<string, VerifiedField>;
  onVerify?: (draw: DrawPayload, slotIndex: number) => void;
  verifyDisabled?: boolean;
  /** Optional trailing actions (verdict picker etc.). */
  footer?: React.ReactNode;
}) {
  const { draw, collected, onCollect, verified, onVerify, verifyDisabled, footer } = props;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const m of draw.text.matchAll(MARK)) {
    const idx = Number(m[1]);
    const at = m.index ?? 0;
    if (at > cursor) parts.push(draw.text.slice(cursor, at));
    const slot = draw.slots[idx];
    if (slot) {
      const v = verified?.[slot.fieldId];
      const cls = v
        ? v.truth === slot.value
          ? "ae-chip is-verified-ok"
          : "ae-chip is-verified-bad"
        : "ae-chip";
      parts.push(
        <button
          className={cls}
          disabled={!onVerify || verifyDisabled}
          key={`chip-${idx}`}
          onClick={() => onVerify?.(draw, idx)}
          title={v ? `事实：${v.truth ?? "无此条目"}` : "点击查证此字段"}
          type="button"
        >
          <span className="ae-chip-label">{SLOT_LABELS[slot.slot as SlotKey] ?? slot.slot}</span>
          {slot.value}
        </button>,
      );
    }
    cursor = at + m[0].length;
  }
  if (cursor < draw.text.length) parts.push(draw.text.slice(cursor));

  return (
    <div className="ae-answer">
      <p className="ae-answer-q">
        {draw.questionText}
        <span className="ae-cites"> · 依据资料卡 {draw.cites.length} 条</span>
      </p>
      <p className="ae-answer-text">{parts}</p>
      {onCollect ? (
        <div className="ae-row">
          <button
            className={`button ${collected ? "button-secondary" : "button-ghost"}`}
            onClick={() => onCollect(draw.drawId, !collected)}
            type="button"
          >
            {collected ? "移出证据" : "收进证据"}
          </button>
        </div>
      ) : null}
      {footer}
    </div>
  );
}
