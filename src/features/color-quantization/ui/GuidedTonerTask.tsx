/**
 * Guided coding task (stage 1): complete `nearest_toner(r, g, b, toners)` —
 * the one line of judgment inside the printer's fixed mapping rule. The
 * program is presented as inline blanks rather than a free-form editor; the
 * assembled source is still what runs in the Pyodide worker and what gets
 * saved as the draft. Students first predict each test color's destination
 * by hand, then watch their code make the same judgment.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../shared/ui/Icon";
import { colorDist2, PAPER, SOURCE_COLORS, TONER_RACK, rgbCss } from "../domain/palette.ts";
import { runNearestToner } from "./pyodideRunner.ts";

/** toners[0] is paper; 1..8 are the rack. Same convention as the reference. */
const CANDIDATES = [PAPER, ...TONER_RACK.map((t) => t.rgb)];

/** Source colors shown as test cases — a mix of anchors and straddlers. */
const TEST_INDICES = [0, 1, 3, 6, 8, 13];

function referencePick(rgb: readonly number[]): number {
  let best = 0;
  let bestD = colorDist2(rgb as [number, number, number], CANDIDATES[0]);
  for (let i = 1; i < CANDIDATES.length; i += 1) {
    const d = colorDist2(rgb as [number, number, number], CANDIDATES[i]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Assemble runnable Python from the two blanks. */
function assemble(blueExpr: string, condExpr: string): string {
  return `def nearest_toner(r, g, b, toners):
    # toners: 候选颜色列表, 每个是 [r, g, b], toners[0] 是纸白
    best = 0
    best_d = (r - toners[0][0])**2 + (g - toners[0][1])**2 + (b - toners[0][2])**2
    for i in range(1, len(toners)):
        d = (r - toners[i][0])**2 + (g - toners[i][1])**2 + ${blueExpr}
        if ${condExpr}:
            best_d = d
            best = i
    return best
`;
}

/** Recover the two blanks from a previously saved source, if it still fits. */
function parseBlanks(code: string): [string, string] | null {
  const blue = /d = \(r - toners\[i\]\[0\]\)\*\*2 \+ \(g - toners\[i\]\[1\]\)\*\*2 \+ (.+)/.exec(
    code,
  );
  const cond = /if\s+(.+):/.exec(code);
  return blue && cond ? [blue[1].trim(), cond[1].trim()] : null;
}

/** Candidate label: 0 = 纸, 1..8 = toner number. */
function candidateName(index: number): string {
  return index === 0 ? "纸" : String(index);
}

function Swatch({ index, label }: { index: number; label?: string }) {
  return (
    <span
      aria-label={label ?? (index === 0 ? "纸白" : TONER_RACK[index - 1].name)}
      className="quant-swatch"
      style={{ background: rgbCss(index === 0 ? PAPER : TONER_RACK[index - 1].rgb) }}
      title={label ?? (index === 0 ? "纸白（不印粉）" : TONER_RACK[index - 1].name)}
    >
      {candidateName(index)}
    </span>
  );
}

type CheckRow = { index: number; expected: number; got: number | null };

export function GuidedTonerTask({
  code,
  onCodeChange,
}: {
  code: string;
  onCodeChange: (code: string) => void;
}) {
  const testColors = useMemo(() => TEST_INDICES.map((i) => SOURCE_COLORS[i]), []);
  const expected = useMemo(() => testColors.map((c) => referencePick(c.rgb)), [testColors]);
  const initial = useMemo(() => parseBlanks(code), []); // mount-time only
  const [blankBlue, setBlankBlue] = useState(initial?.[0] ?? "");
  const [blankCond, setBlankCond] = useState(initial?.[1] ?? "");
  const [guesses, setGuesses] = useState<(number | null)[]>(() => testColors.map(() => null));
  const [rows, setRows] = useState<CheckRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [passed, setPassed] = useState<boolean | null>(null);
  const lastEmitted = useRef<string | null>(null);

  // If a saved draft arrives after mount, fold it back into the blanks.
  useEffect(() => {
    if (code === lastEmitted.current) return;
    const parsed = parseBlanks(code);
    if (parsed) {
      setBlankBlue(parsed[0]);
      setBlankCond(parsed[1]);
    }
  }, [code]);

  const updateBlank = (which: "blue" | "cond", value: string) => {
    const blue = which === "blue" ? value : blankBlue;
    const cond = which === "cond" ? value : blankCond;
    if (which === "blue") setBlankBlue(value);
    else setBlankCond(value);
    const source = assemble(blue, cond);
    lastEmitted.current = source;
    onCodeChange(source);
  };

  const run = async () => {
    if (!blankBlue.trim() || !blankCond.trim()) {
      setError("先把两个空都填上，再运行。");
      setPassed(false);
      return;
    }
    setRunning(true);
    setError(null);
    setRows(null);
    try {
      const results = await runNearestToner(
        assemble(blankBlue, blankCond),
        testColors.map((c) => [...c.rgb]),
        CANDIDATES.map((c) => [...c]),
      );
      const next = results.map((raw, index) => {
        const got = Number(raw);
        return {
          index,
          expected: expected[index],
          got: Number.isInteger(got) && got >= 0 && got < CANDIDATES.length ? got : null,
        };
      });
      setRows(next);
      setPassed(next.every((row) => row.got === row.expected));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPassed(false);
    } finally {
      setRunning(false);
    }
  };

  return (
    <section aria-labelledby="guided-toner-title" className="quant-guided">
      <h3 id="guided-toner-title">小练习：一种颜色落到哪种粉</h3>
      <p>
        打印机只有一条规则：<strong>每种源色落到离它最近的候选色</strong>
        ——候选是纸白加上已装的墨粉。距离按 RGB 三个通道的平方差相加计算。
      </p>
      <p>
        先别看代码——下面是 6 个真实源色。对每个颜色，点选你认为它会落到的目标（纸 = 留白不印）：
      </p>

      <div className="quant-color-strip">
        {testColors.map((color, index) => {
          const row = rows?.[index];
          return (
            <figure className="quant-color-card" key={index}>
              <span
                className="quant-swatch is-source"
                style={{ background: rgbCss(color.rgb) }}
                title={`${color.name} rgb(${color.rgb.join(",")})`}
              >
                {TEST_INDICES[index] + 1}
              </span>
              <figcaption>
                {index + 1}号 · {color.name}
              </figcaption>
              {row ? (
                <span
                  className={`quant-map-outcome${row.got === row.expected ? " is-ok" : " is-bad"}`}
                  title={`代码输出 → ${row.got === null ? "无效" : candidateName(row.got)}，规则答案 ${candidateName(row.expected)}`}
                >
                  → {row.got === null ? "?" : <Swatch index={row.got} />}
                </span>
              ) : null}
              <div aria-label={`${color.name} 你的判断`} className="quant-guess-row" role="group">
                {CANDIDATES.map((_c, ci) => (
                  <button
                    aria-label={`候选 ${ci === 0 ? "纸白" : TONER_RACK[ci - 1].name}`}
                    aria-pressed={guesses[index] === ci}
                    className={`quant-mini-swatch${guesses[index] === ci ? " is-active" : ""}`}
                    key={ci}
                    onClick={() =>
                      setGuesses((prev) => {
                        const next = [...prev];
                        next[index] = next[index] === ci ? null : ci;
                        return next;
                      })
                    }
                    style={{ background: rgbCss(CANDIDATES[ci]) }}
                    type="button"
                  >
                    {candidateName(ci)}
                  </button>
                ))}
              </div>
              {guesses[index] !== null ? (
                <span
                  className={`quant-guess-verdict${
                    guesses[index] === expected[index] ? " is-ok" : " is-bad"
                  }`}
                >
                  {guesses[index] === expected[index]
                    ? "和规则一致"
                    : `规则给 ${candidateName(expected[index])}`}
                </span>
              ) : null}
            </figure>
          );
        })}
      </div>

      <p>再补全这段代码里的两个空，让它对所有这些颜色都给出和规则一致的结果：</p>
      <div className="quant-code-fill" role="group" aria-label="nearest_toner 代码填空">
        <pre>
          <code>
            {"def nearest_toner(r, g, b, toners):\n"}
            {"    # toners: 候选颜色列表, toners[0] 是纸白\n"}
            {"    best = 0\n"}
            {"    best_d = (r - toners[0][0])**2 + (g - toners[0][1])**2 + (b - toners[0][2])**2\n"}
            {"    for i in range(1, len(toners)):\n"}
            {"        d = (r - toners[i][0])**2 + (g - toners[i][1])**2 + "}
            <input
              aria-label="空 1：蓝色通道的距离项"
              className="quant-blank"
              onChange={(event) => updateBlank("blue", event.target.value)}
              placeholder="(b - toners[i][2])**2"
              size={Math.max(16, blankBlue.length + 1)}
              spellCheck={false}
              value={blankBlue}
            />
            {"\n"}
            {"        if "}
            <input
              aria-label="空 2：什么条件下更新 best"
              className="quant-blank"
              onChange={(event) => updateBlank("cond", event.target.value)}
              placeholder="d < best_d"
              size={Math.max(10, blankCond.length + 1)}
              spellCheck={false}
              value={blankCond}
            />
            {":\n"}
            {"            best_d = d\n"}
            {"            best = i\n"}
            {"    return best\n"}
          </code>
        </pre>
      </div>

      <div className="quant-actions">
        <button
          className="button button-secondary"
          disabled={running}
          onClick={() => void run()}
          type="button"
        >
          {running ? "运行中…（首次需加载 Python）" : "运行检查"}
        </button>
        {passed === true ? (
          <span className="quant-badge is-pass">
            <Icon name="check" size={12} /> 全部一致
          </span>
        ) : null}
        {passed === false && !error ? <span className="quant-badge is-fail">还不一致</span> : null}
      </div>
      {error ? (
        <pre className="quant-error" role="alert">
          {error}
        </pre>
      ) : null}
    </section>
  );
}
