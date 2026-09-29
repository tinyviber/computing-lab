/**
 * Submission artifact checks — pure functions shared by the server judge and
 * the unit tests. Each check reports the first place the artifact diverges
 * from the reference decode without leaking the expected answer.
 */

import type { PixelMatrix } from "./bmp.ts";
import type { DecoderChoice, PartVerdict } from "./protocol.ts";
import type { DecodingStageDef } from "./stages.ts";

export type Expected =
  | { text: string }
  | { signature: string; pixels: PixelMatrix }
  | { pixels: PixelMatrix }
  | { verdicts: { decoder: DecoderChoice; text?: string; pixels?: PixelMatrix }[] };

// ---------- artifact sanitization (bounded, typed) ----------

export function sanitizeText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (text.length === 0 || text.length > 200) return null;
  return text;
}

export function sanitizePixels(raw: unknown): PixelMatrix | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 64) return null;
  const matrix: PixelMatrix = [];
  const width = Array.isArray(raw[0]) ? raw[0].length : 0;
  if (width === 0 || width > 64) return null;
  for (const row of raw) {
    if (!Array.isArray(row) || row.length !== width) return null;
    const outRow: [number, number, number][] = [];
    for (const px of row) {
      if (
        !Array.isArray(px) ||
        px.length !== 3 ||
        !px.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)
      ) {
        return null;
      }
      outRow.push([px[0], px[1], px[2]]);
    }
    matrix.push(outRow);
  }
  return matrix;
}

export function sanitizeSignature(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const sig = raw.trim().toUpperCase();
  if (sig.length === 0 || sig.length > 8) return null;
  return sig;
}

export function sanitizeVerdicts(
  raw: unknown,
): { decoder: DecoderChoice; text?: string; pixels?: PixelMatrix }[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 8) return null;
  const out: { decoder: DecoderChoice; text?: string; pixels?: PixelMatrix }[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const { decoder, text, pixels } = entry as {
      decoder?: unknown;
      text?: unknown;
      pixels?: unknown;
    };
    if (decoder !== "text" && decoder !== "image") return null;
    const item: { decoder: DecoderChoice; text?: string; pixels?: PixelMatrix } = { decoder };
    if (text !== undefined) {
      const t = sanitizeText(text);
      if (t === null) return null;
      item.text = t;
    }
    if (pixels !== undefined) {
      const p = sanitizePixels(pixels);
      if (p === null) return null;
      item.pixels = p;
    }
    out.push(item);
  }
  return out;
}

// ---------- comparisons ----------

function textDetail(actual: string, expected: string): string {
  if (actual.length !== expected.length) {
    return `长度不符：提交了 ${actual.length} 个字符，应有 ${expected.length} 个`;
  }
  for (let i = 0; i < expected.length; i += 1) {
    if (actual[i] !== expected[i]) return `第 ${i + 1} 个字符不符`;
  }
  return "";
}

function pixelsDetail(actual: PixelMatrix, expected: PixelMatrix): string {
  if (actual.length !== expected.length || actual[0]?.length !== expected[0]?.length) {
    return `尺寸不符：提交了 ${actual[0]?.length ?? 0}×${actual.length}，应是 ${expected[0]?.length ?? 0}×${expected.length}`;
  }
  for (let y = 0; y < expected.length; y += 1) {
    for (let x = 0; x < expected[y].length; x += 1) {
      const a = actual[y][x];
      const e = expected[y][x];
      if (a[0] !== e[0] || a[1] !== e[1] || a[2] !== e[2]) {
        return `第 ${y + 1} 行第 ${x + 1} 个像素不符`;
      }
    }
  }
  return "";
}

export function checkText(actual: string, expected: string, label = "解码出的文本"): PartVerdict {
  const detail = textDetail(actual, expected);
  return { id: "text", label, ok: detail === "", detail: detail || null };
}

export function checkSignature(actual: string, expected: string): PartVerdict {
  return {
    id: "signature",
    label: "文件签名",
    ok: actual === expected,
    detail: actual === expected ? null : "签名读得不对——再用字符表解释前两个字节",
  };
}

export function checkPixels(actual: PixelMatrix, expected: PixelMatrix): PartVerdict {
  const detail = pixelsDetail(actual, expected);
  return { id: "pixels", label: "像素矩阵", ok: detail === "", detail: detail || null };
}

/**
 * Verify a submission artifact against the reference answer generated with
 * the payload. Returns one verdict per checked part; a stage passes when
 * every part is ok.
 */
export function verifyArtifact(
  stage: DecodingStageDef,
  artifact: unknown,
  expected: Expected,
): PartVerdict[] {
  switch (stage.kind) {
    case "codes":
    case "bits":
    case "bmp-script": {
      const text = sanitizeText((artifact as { text?: unknown })?.text);
      if (text === null)
        return [{ id: "text", label: "解码出的文本", ok: false, detail: "格式不符" }];
      return [checkText(text, (expected as { text: string }).text)];
    }
    case "bmp": {
      const parts: PartVerdict[] = [];
      const exp = expected as { signature: string; pixels: PixelMatrix };
      if (stage.requiresSignature) {
        const sig = sanitizeSignature((artifact as { signature?: unknown })?.signature);
        if (sig === null) {
          parts.push({ id: "signature", label: "文件签名", ok: false, detail: "格式不符" });
        } else {
          parts.push(checkSignature(sig, exp.signature));
        }
      }
      const pixels = sanitizePixels((artifact as { pixels?: unknown })?.pixels);
      if (pixels === null) {
        parts.push({ id: "pixels", label: "像素矩阵", ok: false, detail: "格式不符" });
      } else {
        parts.push(checkPixels(pixels, exp.pixels));
      }
      return parts;
    }
    case "files": {
      const submitted = sanitizeVerdicts((artifact as { verdicts?: unknown })?.verdicts);
      const exp = (
        expected as { verdicts: { decoder: DecoderChoice; text?: string; pixels?: PixelMatrix }[] }
      ).verdicts;
      if (submitted === null || submitted.length !== exp.length) {
        return exp.map((_, i) => ({
          id: `file-${i}`,
          label: `文件 ${i + 1}`,
          ok: false,
          detail: "判定不完整",
        }));
      }
      return exp.flatMap((want, i) => {
        const got = submitted[i];
        const parts: PartVerdict[] = [
          {
            id: `file-${i}-decoder`,
            label: `文件 ${i + 1} 的解释方式`,
            ok: got.decoder === want.decoder,
            detail:
              got.decoder === want.decoder
                ? null
                : want.decoder === "text"
                  ? "这份应该按字符解码"
                  : "这份应该按图像解码",
          },
        ];
        if (got.decoder === want.decoder) {
          if (want.decoder === "text") {
            const text = got.text ?? "";
            const detail = want.text !== undefined ? textDetail(text, want.text) : "缺少文本结果";
            parts.push({
              id: `file-${i}-text`,
              label: `文件 ${i + 1} 的文本结果`,
              ok: detail === "",
              detail: detail || null,
            });
          } else {
            const detail =
              got.pixels !== undefined && want.pixels !== undefined
                ? pixelsDetail(got.pixels, want.pixels)
                : "缺少像素结果";
            parts.push({
              id: `file-${i}-pixels`,
              label: `文件 ${i + 1} 的像素结果`,
              ok: detail === "",
              detail: detail || null,
            });
          }
        }
        return parts;
      });
    }
  }
}
