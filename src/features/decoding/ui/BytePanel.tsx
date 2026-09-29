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
            return (
              <li
                className={`byte-chip${inHeader ? " is-header" : ""}`}
                key={i}
                title={`#${i}${inHeader ? " · 文件头" : ""}`}
              >
                {byte}
              </li>
            );
          })}
        </ol>
      )}

      {payload.kind === "bmp" ? (
        <p className="byte-legend">
          <span className="byte-chip is-header byte-legend-chip">66</span> 前{" "}
          {BMP_PROFILE.pixelOffset} 字节是文件头——里面藏着「怎么读剩下部分」的约定。
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
