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

/** Header fields the stage-3 conventions live in (little-endian first byte). */
const BMP_FIELDS: Record<number, string> = {
  10: "像素起点",
  18: "宽",
  22: "高",
};

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
            const field = payload.kind === "bmp" ? BMP_FIELDS[i] : undefined;
            return (
              <li
                className={`byte-chip${inHeader ? " is-header" : ""}${field ? " is-field" : ""}`}
                key={i}
                title={`#${i}${field ? ` · ${field}` : inHeader ? " · 文件头" : ""}`}
              >
                {byte}
                {field ? <span className="byte-chip-field">{field}</span> : null}
              </li>
            );
          })}
        </ol>
      )}

      {payload.kind === "bmp" ? (
        <p className="byte-legend">
          <span className="byte-chip is-header byte-legend-chip">66</span> 前{" "}
          {BMP_PROFILE.pixelOffset} 字节是文件头——里面写着「怎么读剩下部分」：# 10 = 像素起点（
          {bytes[10]}）、# 18 = 宽（{bytes[18]}）、# 22 = 高（{bytes[22]}）。
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
