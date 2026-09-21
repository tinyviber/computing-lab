/**
 * Guided coding task (stage 1): complete `cell_value(region)` — the one line
 * of judgment inside the fixed downsampling rule. Runs in the Pyodide worker;
 * verdicts compare the student's outputs to the majority rule on a fixed set
 * of regions with varied coverage.
 */

import { useMemo, useState } from "react";
import { cellRegion, cellStats } from "../domain/downsample.ts";
import { publicGalleryFor } from "../domain/fixtures.ts";
import { runCellValue } from "./pyodideRunner.ts";

const STARTER_CODE = `def cell_value(region):
    # region 是一个二维列表: 1 = 有图形, 0 = 背景
    count = 0
    for row in region:
        for v in row:
            count += v

    # TODO: 当 1 的个数达到总数的一半时返回 1, 否则返回 0
    return 0
`;

type CheckRow = { index: number; expected: number; got: number | null };

/** Deterministic region set: spread coverage across the invader sprite. */
function buildRegions(): { regions: number[][][]; expected: number[] } {
  const image = publicGalleryFor("invader")[0].image;
  const cells: { region: number[][]; on: number; total: number }[] = [];
  for (let cy = 0; cy < 8; cy += 1) {
    for (let cx = 0; cx < 8; cx += 1) {
      const { on, total } = cellStats(image, 8, 8, cx, cy);
      cells.push({ region: cellRegion(image, 8, 8, cx, cy), on, total });
    }
  }
  cells.sort((a, b) => a.on / a.total - b.on / b.total);
  const picks = [2, 12, 22, 32, 44, 56].map((i) => cells[Math.min(i, cells.length - 1)]);
  return {
    regions: picks.map((p) => p.region),
    expected: picks.map((p) => (2 * p.on >= p.total ? 1 : 0)),
  };
}

export function GuidedCellTask({
  code,
  onCodeChange,
}: {
  code: string;
  onCodeChange: (code: string) => void;
}) {
  const { regions, expected } = useMemo(buildRegions, []);
  const [rows, setRows] = useState<CheckRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [passed, setPassed] = useState<boolean | null>(null);

  const source = code.trim() ? code : STARTER_CODE;

  const run = async () => {
    setRunning(true);
    setError(null);
    setRows(null);
    try {
      const results = await runCellValue(source, regions);
      const next = results.map((raw, index) => {
        const got = Number(raw);
        return {
          index,
          expected: expected[index],
          got: got === 0 || got === 1 ? got : null,
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
    <section aria-labelledby="guided-cell-title" className="guided-cell-task">
      <h3 id="guided-cell-title">小练习：一个格子怎么决定</h3>
      <p>
        缩小图片时，每个目标格子对应原图的一小块区域。规则只有一条：
        <strong>这块区域里至少一半的像素是图形（1），这个格子才是 1。</strong>
        补全下面的函数，让它在所有测试区域上都给出正确结果。
      </p>
      <textarea
        aria-label="cell_value 代码"
        className="code-editor"
        onChange={(event) => onCodeChange(event.target.value)}
        rows={10}
        spellCheck={false}
        value={source}
      />
      <div className="guided-actions">
        <button
          className="button button-secondary"
          disabled={running}
          onClick={() => void run()}
          type="button"
        >
          {running ? "运行中…（首次需加载 Python）" : "运行检查"}
        </button>
        {passed === true ? <span className="badge badge-pass">全部一致 ✓</span> : null}
        {passed === false && !error ? <span className="badge badge-fail">还不一致</span> : null}
      </div>
      {error ? (
        <pre className="python-error" role="alert">
          {error}
        </pre>
      ) : null}
      {rows ? (
        <table className="cell-check-table">
          <thead>
            <tr>
              <th>区域</th>
              <th>规则答案</th>
              <th>你的输出</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className={row.got === row.expected ? "is-ok" : "is-bad"} key={row.index}>
                <td>#{row.index + 1}</td>
                <td>{row.expected}</td>
                <td>{row.got ?? "不是 0/1"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
