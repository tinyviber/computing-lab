/**
 * The raw-data panel: what the stage actually hands the student, shown as-is —
 * decimal bytes for codes/BMP, the 8-bit strings for the bits stage (that IS
 * the paper's content; the binary↔decimal connection lives in the stage text
 * and the decoded result map). For BMP payloads the 54-byte header is
 * highlighted as its own region: "the bytes that tell you how to read the
 * rest".
 */

import { BMP_PROFILE } from "../domain/bmp.ts";
import { CHAR_TABLE } from "../domain/encoding.ts";
import type { LabPayload } from "../domain/protocol.ts";

/** Header fields the stage-3 conventions live in: 4-byte little-endian ints. */
const BMP_FIELDS: { start: number; end: number; label: string }[] = [
  { start: 10, end: 13, label: "像素起点" },
  { start: 18, end: 21, label: "宽" },
  { start: 22, end: 25, label: "高" },
];

const bmpFieldAt = (i: number) => BMP_FIELDS.find((f) => i >= f.start && i <= f.end);

export function BytePanel({ payload }: { payload: LabPayload }) {
  if (payload.kind === "files") return null; // files render inside FilesPanel

  const bytes =
    payload.kind === "codes"
      ? payload.codes
      : payload.kind === "bits"
        ? payload.groups.map((g) => Number.parseInt(g, 2))
        : payload.bytes;

  return (
    <section aria-label="原始数据" className="byte-panel">
      <div className="byte-panel-head">
        <h3>原始数据</h3>
      </div>

      {payload.kind === "bits" ? (
        <ol className="bit-stream">
          {payload.groups.map((group, i) => (
            <li className="bit-group" key={i} title={`十进制 ${bytes[i]}`}>
              <code>{group}</code>
              <span className="bit-index">#{i}</span>
            </li>
          ))}
        </ol>
      ) : (
        <ol className="byte-stream">
          {bytes.map((byte, i) => {
            const inHeader = payload.kind === "bmp" && i < BMP_PROFILE.pixelOffset;
            const field = payload.kind === "bmp" ? bmpFieldAt(i) : undefined;
            const fieldHead = field && i === field.start;
            return (
              <li
                className={`byte-chip${inHeader ? " is-header" : ""}${field ? " is-field" : ""}`}
                key={i}
                title={`#${i}${field ? ` · ${field.label}` : inHeader ? " · 文件头" : ""}`}
              >
                {byte}
                {fieldHead ? <span className="byte-chip-field">{field.label}</span> : null}
              </li>
            );
          })}
        </ol>
      )}

      {payload.kind === "bmp" ? (
        <p className="byte-legend">
          <span aria-hidden className="byte-chip is-header byte-legend-chip" /> 前{" "}
          {BMP_PROFILE.pixelOffset} 字节是文件头——里面写着「怎么读剩下部分」（每段 4 字节，小端）：#
          10–13 = 像素起点、# 18–21 = 宽、# 22–25 = 高（值去高亮段里读）。
        </p>
      ) : null}

      <details className="char-table">
        <summary>字符编码表</summary>
        <ol>
          {CHAR_TABLE.map(({ char, code }) => (
            <li key={code}>
              <span className="char-glyph">{char}</span>
              <span className="char-code">{code}</span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
