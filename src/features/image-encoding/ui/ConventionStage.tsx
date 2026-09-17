import {
  BIT_CANVAS_CELLS,
  BIT_CANVAS_EDIT_ROW,
  BIT_CANVAS_SIZE,
  BIT_CANVAS_TABLES,
  decodeBits,
  encodeCells,
} from "../domain/bit-canvas";
import { rgbToHex } from "../domain/model";

type ConventionStageProps = {
  bits: string;
  revealed: boolean;
  passed: boolean;
  onBits: (bits: string) => void;
  onCheck: () => void;
  onReveal: () => void;
};

function BitPicture({ table }: { table: (typeof BIT_CANVAS_TABLES)["gray" | "color"] }) {
  const colors = decodeBits(encodeCells(BIT_CANVAS_CELLS), table);
  return (
    <div className="bit-picture" role="img" aria-label={`同一串 bit 按${table.label}解码`}>
      {colors.map((color, index) => (
        <span
          className={
            Math.floor(index / BIT_CANVAS_SIZE) === BIT_CANVAS_EDIT_ROW ? "is-edit-row" : ""
          }
          key={`${table.id}-${index}`}
          style={{ background: rgbToHex(color) }}
        />
      ))}
    </div>
  );
}

export function ConventionStage({
  bits,
  revealed,
  passed,
  onBits,
  onCheck,
  onReveal,
}: ConventionStageProps) {
  return (
    <section aria-labelledby="image-stage-title" className="image-stage-card">
      <div className="stage-copy">
        <p className="eyebrow">CORE 1 · 8 分钟</p>
        <h2 id="image-stage-title">约定决定 bit 的意义</h2>
        <p>每格用 2 bit 表示：00、01、10、11。请把高亮的一行编码成 16 bit。</p>
      </div>

      <div className="convention-layout">
        <div>
          <h3>{BIT_CANVAS_TABLES.gray.label}</h3>
          <div className="convention-key" aria-label="灰阶约定表">
            {BIT_CANVAS_TABLES.gray.colors.map((color, index) => (
              <span key={rgbToHex(color)}>
                <i style={{ background: rgbToHex(color) }} />
                {index.toString(2).padStart(2, "0")}
              </span>
            ))}
          </div>
          <BitPicture table={BIT_CANVAS_TABLES.gray} />
        </div>

        <div className="bit-entry">
          <label htmlFor="core1-bits">高亮行的 16 bit</label>
          <input
            aria-describedby="core1-bit-count"
            autoComplete="off"
            id="core1-bits"
            inputMode="numeric"
            onChange={(event) => onBits(event.target.value)}
            placeholder="例如 000110…"
            value={bits}
          />
          <span id="core1-bit-count">{bits.length} / 16 bit</span>
          <button className="button button-primary" onClick={onCheck} type="button">
            检查编码
          </button>
        </div>
      </div>

      {passed ? (
        <div className="convention-reveal">
          <div>
            <h3>如果 01 不再代表灰色，而代表红色呢？</h3>
            <p>先猜一猜同一串 bit 会变成什么，再换约定表解码。</p>
            <button className="button button-secondary" onClick={onReveal} type="button">
              {revealed ? "收起约定 B" : "用约定 B 解码同一串 bit"}
            </button>
          </div>
          {revealed ? (
            <div>
              <h3>{BIT_CANVAS_TABLES.color.label}</h3>
              <BitPicture table={BIT_CANVAS_TABLES.color} />
              <p className="stage-insight">bit 没有变，图却变了：解码器必须知道双方约定。</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
