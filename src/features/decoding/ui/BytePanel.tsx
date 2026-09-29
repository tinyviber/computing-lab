/**
 * The raw-data panel: what the stage actually hands the student. Renders the
 * payload as decimal chips (or bit strings for the binary stage), with a
 * 十进制/二进制 toggle — seeing the same byte both ways is the C2 lesson
 * made physical. For BMP payloads the 54-byte header is highlighted as its
 * own region: "the bytes that tell you how to read the rest".
 */

import { useState } from "react";
import { BMP_PROFILE } from "../domain/bmp.ts";
import { byteToBits, CHAR_TABLE } from "../domain/encoding.ts";
import type { LabPayload } from "../domain/protocol.ts";

export function BytePanel({ payload }: { payload: LabPayload }) {
  // Bits stages open on the binary view — it's what the file contains;
  // the 十进制/二进制 toggle is exactly the C2 lesson: same bytes, two suits.
  const [asBinary, setAsBinary] = useState(payload.kind === "bits");

  if (payload.kind === "files") return null; // files render inside FilesPanel

  const bytes =
    payload.kind === "codes"
      ? payload.codes
      : payload.kind === "bits"
        ? payload.groups.map((g) => Number.parseInt(g, 2))
        : payload.bytes;

  const showBitGroups = payload.kind === "bits";

  return (
    <section aria-label="原始数据" className="byte-panel">
      <div className="byte-panel-head">
        <h3>原始数据</h3>
        <div aria-label="数值表示方式" className="rep-toggle" role="group">
          <button
            aria-pressed={!asBinary}
            className={asBinary ? "" : "is-active"}
            onClick={() => setAsBinary(false)}
            type="button"
          >
            十进制
          </button>
          <button
            aria-pressed={asBinary}
            className={asBinary ? "is-active" : ""}
            onClick={() => setAsBinary(true)}
            type="button"
          >
            二进制
          </button>
        </div>
      </div>

      {showBitGroups ? (
        <ol className="bit-stream">
          {payload.groups.map((group, i) => (
            <li className="bit-group" key={i}>
              <code>{asBinary ? group : String(Number.parseInt(group, 2))}</code>
              <span className="bit-index">#{i}</span>
            </li>
          ))}
        </ol>
      ) : (
        <ol className="byte-stream" data-rep={asBinary ? "bin" : "dec"}>
          {bytes.map((byte, i) => {
            const inHeader = payload.kind === "bmp" && i < BMP_PROFILE.pixelOffset;
            return (
              <li
                className={`byte-chip${inHeader ? " is-header" : ""}`}
                key={i}
                title={`#${i}${inHeader ? " · 文件头" : ""}`}
              >
                {asBinary ? byteToBits(byte) : byte}
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
