/**
 * choose_size(images) — the student-written encoder decision, run in the
 * Pyodide worker. It receives the public gallery as 0/1 nested lists, so
 * the resolution is computed from the data instead of being a guessed
 * constant. Its return value fills the (width, height) draft; the
 * submission itself is still just the two numbers, so the server never
 * executes code.
 */

import { useMemo, useState } from "react";
import { imageToLists } from "../domain/bitmap.ts";
import { publicGalleryFor } from "../domain/fixtures.ts";
import type { SamplingStageDef } from "../domain/stages.ts";
import { runChooseSize } from "./pyodideRunner.ts";

const STARTER = (stage: SamplingStageDef) =>
  stage.mode === "square"
    ? `def choose_size(images):
    # images: 这一类所有图片的列表, 每张是 64×64 的二维列表
    #   images[0][y][x] -> 0 (背景) 或 1 (图形)
    # 任务: 分析这些图, 算出一个 n, 让它们缩到 n×n 后仍能区分开
    # 提示: 图与图的差异出现在多小的尺度上?
    return 16
`
    : `def choose_size(images):
    # images: 这一类所有图片的列表, 每张是 64×64 的二维列表
    #   images[0][y][x] -> 0 (背景) 或 1 (图形)
    # 任务: 分析这些图, 算出 (宽, 高) —— 两者可以不同
    # 提示: 这一类图的差异主要发生在水平方向还是垂直方向?
    return (16, 16)
`;

export function ChooseSizePanel({
  stage,
  code,
  onCodeChange,
  onResolution,
}: {
  stage: SamplingStageDef;
  code: string;
  onCodeChange: (code: string) => void;
  onResolution: (width: number, height: number) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const source = code.trim() ? code : STARTER(stage);
  const images = useMemo(
    () => publicGalleryFor(stage.category).map((entry) => imageToLists(entry.image)),
    [stage.category],
  );

  const run = async () => {
    setRunning(true);
    setError(null);
    setApplied(null);
    try {
      const result = await runChooseSize(source, images);
      // `return 16` → scalar; `return (w, h)` → array. A lone n means n×n.
      const values = Array.isArray(result) ? result : [result];
      const [rw, rh] =
        values.length === 1
          ? [Number(values[0]), Number(values[0])]
          : [Number(values[0]), Number(values[1])];
      if (values.length > 2 || !Number.isInteger(rw) || !Number.isInteger(rh)) {
        throw new Error("choose_size 需要返回一个整数 n 或一对整数 (宽, 高)。");
      }
      if (rw < 2 || rh < 2 || rw > 64 || rh > 64) {
        throw new Error("分辨率的宽和高都要在 2～64 之间。");
      }
      if (stage.mode === "square" && rw !== rh) {
        throw new Error("这一关要求正方形分辨率：宽和高必须相同。");
      }
      onResolution(rw, rh);
      setApplied(`choose_size(images) → ${rw} × ${rh}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section aria-labelledby="choose-size-title" className="choose-size-panel">
      <h3 id="choose-size-title">把策略写成代码（可选）</h3>
      <p>
        写一个 <code>choose_size(images)</code> 函数：它会拿到上面公开图库的全部 {images.length}{" "}
        张图（每张 64×64 的 0/1 列表），由你的代码算出分辨率并填入上方—— 注意它对整个 category
        只返回一个尺寸。
      </p>
      <textarea
        aria-label="choose_size 代码"
        className="code-editor"
        onChange={(event) => onCodeChange(event.target.value)}
        rows={7}
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
          {running ? "运行中…" : "运行并填入分辨率"}
        </button>
        {applied ? <span className="badge badge-pass">{applied}</span> : null}
      </div>
      {error ? (
        <pre className="python-error" role="alert">
          {error}
        </pre>
      ) : null}
    </section>
  );
}
