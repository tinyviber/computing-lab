import { useMemo, useState } from "react";
import type { PixelMatrix } from "../domain/bmp.ts";

/** Parse `print(list)` output like "[66, 77, 0, ...]" back into ints; null
 *  when the stream isn't a plain int list (then show it verbatim). */
function parseByteList(raw: string): number[] | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const parts = trimmed.slice(1, -1).split(",");
  if (!parts.every((part) => /^\s*\d+\s*$/.test(part))) return null;
  return parts.map((part) => Number(part));
}

/** The generated sample input: copyable, and split one line per stored pixel
 *  row once a decoded image is available — BMP stores bottom row first, so
 *  row tags count down y=h-1 … y=0. */
export function SampleBytes({ raw, pixels }: { raw: string; pixels: PixelMatrix | null }) {
  const [copied, setCopied] = useState(false);
  const bytes = useMemo(() => parseByteList(raw), [raw]);
  const grouped = useMemo(() => {
    if (!bytes || !pixels) return null;
    const h = pixels.length;
    const w = pixels[0]?.length ?? 0;
    const headerLen = bytes.length - h * w * 3;
    if (w === 0 || headerLen <= 0) return null;
    const rows: number[][] = [];
    for (let i = 0; i < h; i += 1) {
      rows.push(bytes.slice(headerLen + i * w * 3, headerLen + (i + 1) * w * 3));
    }
    return { header: bytes.slice(0, headerLen), rows, h };
  }, [bytes, pixels]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (e.g. non-secure context) — nothing to copy to
    }
  };
  return (
    <>
      <div className="decode-example-bytes-head">
        <h4>样例输入</h4>
        <button
          className="button button-ghost decode-copy"
          onClick={() => void copy()}
          type="button"
        >
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      {grouped ? (
        <pre className="decode-example-bytes">
          <span className="bytes-line">
            <span className="bytes-tag">文件头</span>
            <code>[{grouped.header.join(", ")}]</code>
          </span>
          {grouped.rows.map((row, i) => (
            <span className="bytes-line" key={i}>
              <span className="bytes-tag">y={grouped.h - 1 - i}</span>
              <code>[{row.join(", ")}]</code>
            </span>
          ))}
        </pre>
      ) : (
        <pre className="decode-example-bytes">
          <code>{raw}</code>
        </pre>
      )}
    </>
  );
}
