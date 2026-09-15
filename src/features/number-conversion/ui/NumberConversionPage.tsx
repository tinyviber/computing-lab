import { useEffect, useMemo, useState } from "react";
import { LabShell } from "../../../shared/lab/LabShell";
import {
  divisionResult,
  fractionResult,
  multiplyByTwoSteps,
  normalizeBinary,
  normalizeFraction,
  normalizeInteger,
  positionalTerms,
  positionalTotal,
  shortDivisionSteps,
  type ConversionPart,
  type DivisionStep,
  type MultiplyStep,
  type PositionalTerm,
} from "../domain/model";
import "./number-conversion.css";

type Direction = "decimal-to-binary" | "binary-to-decimal";

function formatFraction(value: number): string {
  return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") || "0";
}

function formatPosition(position: number): string {
  return position < 0 ? `−${Math.abs(position)}` : String(position);
}

function PlayerControls({
  playing,
  stepCount,
  total,
  onPlay,
  onReset,
  onStep,
}: {
  playing: boolean;
  stepCount: number;
  total: number;
  onPlay: () => void;
  onReset: () => void;
  onStep: () => void;
}) {
  return (
    <div className="conversion-player" aria-label="动画控制">
      <button
        className="button button-primary"
        disabled={playing || stepCount >= total}
        onClick={onPlay}
        type="button"
      >
        {playing ? "播放中…" : stepCount >= total ? "播放完成" : "播放步骤"}
      </button>
      <button
        className="button button-secondary"
        disabled={playing || stepCount >= total}
        onClick={onStep}
        type="button"
      >
        下一步
      </button>
      <button className="button button-ghost" onClick={onReset} type="button">
        重来
      </button>
      <span className="conversion-player-count">
        已显示 {stepCount} / {total} 步
      </span>
    </div>
  );
}

function useStepPlayer(total: number, resetKey: string) {
  const [stepCount, setStepCount] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setStepCount(0);
    setPlaying(false);
  }, [resetKey]);

  useEffect(() => {
    if (!playing) return undefined;
    if (stepCount >= total) {
      setPlaying(false);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setStepCount((current) => Math.min(total, current + 1));
    }, 720);
    return () => window.clearTimeout(timer);
  }, [playing, stepCount, total]);

  return {
    stepCount,
    playing,
    play: () => setPlaying(true),
    reset: () => {
      setStepCount(0);
      setPlaying(false);
    },
    step: () => setStepCount((current) => Math.min(total, current + 1)),
  };
}

function DivisionAnimation({
  value,
  steps,
  player,
}: {
  value: number;
  steps: DivisionStep[];
  player: ReturnType<typeof useStepPlayer>;
}) {
  return (
    <section className="conversion-animation" aria-labelledby="division-heading">
      <div className="conversion-section-heading">
        <div>
          <p className="eyebrow">整数部分</p>
          <h3 id="division-heading">短除法：连续除以 2</h3>
        </div>
        <code>{value} ÷ 2</code>
      </div>
      <p className="conversion-explanation">
        每次留下一个余数，商继续除以 2。最后把余数从下往上读。
      </p>
      <PlayerControls
        onPlay={player.play}
        onReset={player.reset}
        onStep={player.step}
        playing={player.playing}
        stepCount={player.stepCount}
        total={steps.length}
      />
      <ol className="conversion-step-list">
        {steps.slice(0, player.stepCount).map((step, index) => (
          <li className="conversion-step" key={`${step.dividend}-${index}`}>
            <span className="conversion-step-index">{index + 1}</span>
            <code>
              {step.dividend} ÷ 2 = {step.quotient} …… {step.remainder}
            </code>
            <span>余数 {step.remainder}</span>
          </li>
        ))}
      </ol>
      {player.stepCount === 0 ? (
        <p className="conversion-empty-step">点击播放，逐步观察每一次除法。</p>
      ) : null}
      <div className="conversion-result">
        <span>余数倒序</span>
        <strong>{divisionResult(steps.slice(0, player.stepCount)) || "等待动画"}</strong>
        {player.stepCount >= steps.length ? (
          <small>
            所以 {value} 的二进制是 {divisionResult(steps)}。
          </small>
        ) : null}
      </div>
    </section>
  );
}

function MultiplyAnimation({
  value,
  steps,
  player,
}: {
  value: number;
  steps: MultiplyStep[];
  player: ReturnType<typeof useStepPlayer>;
}) {
  return (
    <section className="conversion-animation" aria-labelledby="multiply-heading">
      <div className="conversion-section-heading">
        <div>
          <p className="eyebrow">小数部分</p>
          <h3 id="multiply-heading">乘 2：取整数部分作为下一位</h3>
        </div>
        <code>{formatFraction(value)} × 2</code>
      </div>
      <p className="conversion-explanation">
        每次把剩下的小数乘 2，乘积的整数部分就是下一位二进制数字。
      </p>
      <PlayerControls
        onPlay={player.play}
        onReset={player.reset}
        onStep={player.step}
        playing={player.playing}
        stepCount={player.stepCount}
        total={steps.length}
      />
      <ol className="conversion-step-list">
        {steps.slice(0, player.stepCount).map((step, index) => (
          <li className="conversion-step" key={`${step.fraction}-${index}`}>
            <span className="conversion-step-index">{index + 1}</span>
            <code>
              {formatFraction(step.fraction)} × 2 = {formatFraction(step.product)}
            </code>
            <span>
              取 {step.bit}，余数 {formatFraction(step.remainder)}
            </span>
          </li>
        ))}
      </ol>
      {player.stepCount === 0 ? (
        <p className="conversion-empty-step">点击播放，逐步观察每一次乘法。</p>
      ) : null}
      <div className="conversion-result">
        <span>二进制小数位</span>
        <strong>0.{fractionResult(steps.slice(0, player.stepCount)) || "等待动画"}</strong>
        {player.stepCount >= steps.length ? (
          <small>
            所以 {formatFraction(value)} 的二进制近似是 0.{fractionResult(steps)}。
          </small>
        ) : null}
      </div>
    </section>
  );
}

function PositionalSum({
  pattern,
  terms,
  part,
}: {
  pattern: string;
  terms: PositionalTerm[];
  part: ConversionPart;
}) {
  const total = positionalTotal(terms);
  return (
    <section className="conversion-animation" aria-labelledby="sum-heading">
      <div className="conversion-section-heading">
        <div>
          <p className="eyebrow">{part === "integer" ? "整数部分" : "小数部分"}</p>
          <h3 id="sum-heading">按位相加：每一位乘以对应次方</h3>
        </div>
        <code>{part === "integer" ? pattern : `0.${pattern}`}</code>
      </div>
      <p className="conversion-explanation">
        {part === "integer"
          ? "小数点左边从 0 次方开始，向左每移一位，次方加 1。"
          : "小数点右边从 −1 次方开始，向右每移一位，次方再减 1。"}
      </p>
      <div className="conversion-term-list">
        {terms.map((term) => (
          <div className="conversion-term" key={term.position}>
            <strong>{term.bit}</strong>
            <span>×</span>
            <code>
              2<sup>{formatPosition(term.position)}</sup>
            </code>
            <span>=</span>
            <code>{formatFraction(term.contribution)}</code>
          </div>
        ))}
      </div>
      <div className="conversion-result">
        <span>次方相加</span>
        <strong>{formatFraction(total)}</strong>
        <small>
          {terms
            .filter((term) => term.bit === 1)
            .map((term) => `2^${formatPosition(term.position)}`)
            .join(" + ") || "0"}
        </small>
      </div>
    </section>
  );
}

export function NumberConversionPage() {
  const [direction, setDirection] = useState<Direction>("decimal-to-binary");
  const [part, setPart] = useState<ConversionPart>("integer");
  const [integerInput, setIntegerInput] = useState("13");
  const [fractionInput, setFractionInput] = useState("0.625");
  const [binaryInputs, setBinaryInputs] = useState({ integer: "1011", fraction: "101" });

  const integerValue = normalizeInteger(integerInput);
  const fractionValue = normalizeFraction(fractionInput);
  const binaryValue = normalizeBinary(binaryInputs[part], part);
  const divisionSteps = useMemo(() => shortDivisionSteps(integerValue), [integerValue]);
  const multiplySteps = useMemo(() => multiplyByTwoSteps(fractionValue), [fractionValue]);
  const terms = useMemo(() => positionalTerms(binaryValue, part), [binaryValue, part]);
  const animationSteps =
    direction === "decimal-to-binary" && part === "integer" ? divisionSteps : multiplySteps;
  const player = useStepPlayer(
    animationSteps.length,
    `${direction}-${part}-${integerValue}-${fractionValue}-${binaryValue}`,
  );

  return (
    <LabShell eyebrow="基础 / 01" subtitle="整数与小数分开观察" title="进制转换">
      <div className="conversion-course">
        <header className="conversion-intro">
          <p className="eyebrow">数的表示</p>
          <h2>十进制和二进制，来回走一遍</h2>
          <p>整数部分和小数部分用不同方法。先看步骤，再看结果，最后自己换一个数试试。</p>
        </header>

        <div className="conversion-direction-tabs" aria-label="转换方向" role="tablist">
          <button
            aria-selected={direction === "decimal-to-binary"}
            className={direction === "decimal-to-binary" ? "is-active" : ""}
            onClick={() => setDirection("decimal-to-binary")}
            role="tab"
            type="button"
          >
            十进制转二进制
          </button>
          <button
            aria-selected={direction === "binary-to-decimal"}
            className={direction === "binary-to-decimal" ? "is-active" : ""}
            onClick={() => setDirection("binary-to-decimal")}
            role="tab"
            type="button"
          >
            二进制转十进制
          </button>
        </div>

        <div className="conversion-layout">
          <aside className="conversion-controls">
            <section className="conversion-card">
              <p className="eyebrow">第一步</p>
              <h3>先选整数还是小数</h3>
              <div className="conversion-part-tabs" aria-label="数的部分" role="tablist">
                <button
                  aria-selected={part === "integer"}
                  className={part === "integer" ? "is-active" : ""}
                  onClick={() => setPart("integer")}
                  role="tab"
                  type="button"
                >
                  整数部分
                </button>
                <button
                  aria-selected={part === "fraction"}
                  className={part === "fraction" ? "is-active" : ""}
                  onClick={() => setPart("fraction")}
                  role="tab"
                  type="button"
                >
                  小数部分
                </button>
              </div>
            </section>

            <section className="conversion-card">
              <p className="eyebrow">第二步</p>
              <h3>换一个数</h3>
              {direction === "decimal-to-binary" && part === "integer" ? (
                <label className="conversion-input-label">
                  十进制整数
                  <input
                    inputMode="numeric"
                    max="255"
                    min="0"
                    onChange={(event) => setIntegerInput(event.target.value)}
                    type="number"
                    value={integerInput}
                  />
                  <small>示范范围：0 到 255</small>
                </label>
              ) : null}
              {direction === "decimal-to-binary" && part === "fraction" ? (
                <label className="conversion-input-label">
                  十进制小数
                  <input
                    inputMode="decimal"
                    max="0.999999"
                    min="0"
                    onChange={(event) => setFractionInput(event.target.value)}
                    step="0.001"
                    type="number"
                    value={fractionInput}
                  />
                  <small>只看 0 到 1 之间的小数</small>
                </label>
              ) : null}
              {direction === "binary-to-decimal" ? (
                <label className="conversion-input-label">
                  二进制{part === "integer" ? "整数" : "小数位"}
                  <input
                    inputMode="numeric"
                    onChange={(event) =>
                      setBinaryInputs((current) => ({ ...current, [part]: event.target.value }))
                    }
                    pattern="[01]+"
                    value={binaryInputs[part]}
                  />
                  <small>只输入 0 和 1</small>
                </label>
              ) : null}
            </section>

            <section className="conversion-card conversion-rule-card">
              <p className="eyebrow">记住规则</p>
              <h3>{part === "integer" ? "整数看余数" : "小数看取出的整数位"}</h3>
              <p>
                {direction === "decimal-to-binary"
                  ? part === "integer"
                    ? "除以 2，余数从下往上读。"
                    : "乘以 2，整数部分从上往下读。"
                  : part === "integer"
                    ? "每一位乘以 2 的对应次方，再相加。"
                    : "小数点右边使用负次方，再相加。"}
              </p>
            </section>
          </aside>

          <main className="conversion-main" aria-label="进制转换教学区">
            {direction === "decimal-to-binary" && part === "integer" ? (
              <DivisionAnimation player={player} steps={divisionSteps} value={integerValue} />
            ) : null}
            {direction === "decimal-to-binary" && part === "fraction" ? (
              <MultiplyAnimation player={player} steps={multiplySteps} value={fractionValue} />
            ) : null}
            {direction === "binary-to-decimal" ? (
              <PositionalSum part={part} pattern={binaryValue} terms={terms} />
            ) : null}
          </main>
        </div>
      </div>
    </LabShell>
  );
}
