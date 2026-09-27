/**
 * FactTable — C3's adjudication bench. Draws arrive one at a time via the
 * server cursor; each answer's slot chips can be verified against the fact
 * table (配额 limited), then the student records 可信 / 存疑 / 交人工.
 * A 存疑 verdict must cite a verified fieldId of that very draw.
 */

import { C3_DRAW_COUNT, VERIFY_QUOTA } from "../domain/protocol.ts";
import type { AiEvalDraft, DrawPayload, VerdictChoice } from "../domain/protocol.ts";
import { AnswerCard, type VerifiedField } from "./AnswerCard.tsx";

const VERDICT_LABELS: Record<VerdictChoice["v"], string> = {
  trust: "可信",
  doubt: "存疑",
  human: "交人工",
};

export function FactTable(props: {
  draft: AiEvalDraft;
  draws: DrawPayload[];
  verified: Record<string, VerifiedField>;
  verifyQuotaLeft: number;
  onNext: () => void;
  onVerify: (draw: DrawPayload, slotIndex: number) => void;
  onVerdict: (drawId: string, choice: VerdictChoice | null) => void;
  busy: boolean;
}) {
  const { draft, draws, verified, verifyQuotaLeft, onNext, onVerify, onVerdict, busy } = props;
  const verifyLog = new Set(draft.verifyLog);

  return (
    <section aria-label="裁决台" className="ae-panel">
      <p className="eyebrow">裁决台</p>
      <div className="ae-row">
        <button
          className="button button-secondary"
          disabled={busy || draws.length >= C3_DRAW_COUNT}
          onClick={onNext}
          type="button"
        >
          {draws.length === 0 ? "申领第一条回答" : `申领下一条（${draws.length}/${C3_DRAW_COUNT}）`}
        </button>
        <span className="ae-quota">
          查证配额：{Math.max(0, verifyQuotaLeft)}/{VERIFY_QUOTA}
        </span>
        <span className="ae-hint">
          点回答里的槽值芯片可查真值；「存疑」必须挂一个查证过且不符的字段。
        </span>
      </div>

      {draws.map((draw, i) => {
        const verdict = draft.verdicts[draw.drawId];
        const verifiedHere = draw.slots.filter((s) => verifyLog.has(s.fieldId));
        return (
          <div key={draw.drawId}>
            <div className="ae-row">
              <strong>#{i + 1}</strong>
              <span className="ae-verify-line">drawId {draw.drawId}</span>
            </div>
            <AnswerCard
              draw={draw}
              onVerify={onVerify}
              verified={verified}
              verifyDisabled={verifyQuotaLeft <= 0 || busy}
            />
            <div className="ae-verdict" role="radiogroup" aria-label={`第 ${i + 1} 条的裁决`}>
              {(["trust", "doubt", "human"] as const).map((v) => (
                <label key={v}>
                  <input
                    checked={verdict?.v === v}
                    onChange={() =>
                      onVerdict(draw.drawId, verdict?.v === v ? null : { v, fieldId: undefined })
                    }
                    type="radio"
                  />
                  {VERDICT_LABELS[v]}
                </label>
              ))}
              {verdict?.v === "doubt" ? (
                <select
                  aria-label="存疑字段"
                  onChange={(e) =>
                    onVerdict(draw.drawId, { v: "doubt", fieldId: e.target.value || undefined })
                  }
                  value={verdict.fieldId ?? ""}
                >
                  <option value="">选查证的字段…</option>
                  {verifiedHere.map((s) => (
                    <option key={s.fieldId} value={s.fieldId}>
                      {s.fieldId}（答:{s.value} → 实:{verified[s.fieldId]?.truth ?? "?"}）
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}
