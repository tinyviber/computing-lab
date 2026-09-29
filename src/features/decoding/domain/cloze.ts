/**
 * Cloze (fill-in-the-blank) starter code. A stage's starterCode may carry
 * `__(n)__` blank markers; the UI renders the surrounding code read-only and
 * an inline text input per blank. The student's answer is the fills map —
 * `assembleCloze` substitutes them back into runnable Python.
 */

const BLANK_RE = /__\((\d+)\)__/g;

export type ClozePart = { kind: "text"; text: string } | { kind: "blank"; id: string };

/** Split starter code into alternating text segments and blank ids. */
export function parseCloze(code: string): ClozePart[] {
  const parts: ClozePart[] = [];
  let last = 0;
  for (const match of code.matchAll(BLANK_RE)) {
    const index = match.index;
    if (index > last) parts.push({ kind: "text", text: code.slice(last, index) });
    parts.push({ kind: "blank", id: match[1] });
    last = index + match[0].length;
  }
  if (last < code.length) parts.push({ kind: "text", text: code.slice(last) });
  return parts;
}

export function hasCloze(code: string): boolean {
  // Not BLANK_RE: a /g regex test() advances lastIndex across calls.
  return /__\(\d+\)__/.test(code);
}

/** Substitute fills into the template; an unfilled blank becomes `?` (a syntax error on run). */
export function assembleCloze(code: string, fills: Record<string, string>): string {
  return code.replace(BLANK_RE, (_, id: string) => {
    const fill = fills[id]?.trim();
    return fill ? fill : "?";
  });
}

/** True when every blank in the template has a non-empty fill. */
export function clozeComplete(code: string, fills: Record<string, string>): boolean {
  return parseCloze(code)
    .filter((p) => p.kind === "blank")
    .every((p) => (fills[p.id] ?? "").trim().length > 0);
}
