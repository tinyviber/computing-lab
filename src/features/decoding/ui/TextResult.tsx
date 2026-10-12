import { CHAR_TABLE } from "../domain/encoding.ts";
import type { DecodingStageDef } from "../domain/stages.ts";

/** The decoded text plus the code→char map that made it — the visible proof
 *  that a byte stream only means something under an agreed table. */
export function TextResult({ text, stage }: { text: string; stage: DecodingStageDef }) {
  const table = CHAR_TABLE;
  const codes = [...text].map((ch) => ch.charCodeAt(0));
  return (
    <div className="run-result">
      <p className="run-result-label">decode(data) →</p>
      <p className="decoded-text">{text || "（空串）"}</p>
      {stage.kind === "codes" || stage.kind === "bits" ? (
        <ol className="decoded-map">
          {codes.slice(0, 24).map((code, i) => (
            <li key={i}>
              <span className="decoded-code">
                {stage.kind === "bits" ? code.toString(2).padStart(8, "0") : code}
              </span>
              <span className="decoded-arrow">→</span>
              <span className="decoded-char">{text[i]}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {stage.kind === "codes" ? (
        <p className="decoded-count">每个数字都按编码表对上了字符（空格={table[0].code}）。</p>
      ) : null}
    </div>
  );
}
