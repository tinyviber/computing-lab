import { useEffect, useMemo, useReducer } from "react";
import { useSearch } from "@tanstack/react-router";
import { LabShell } from "../../../shared/lab/LabShell";
import {
  bitWeights,
  deriveIntegerModel,
  interpretSigned,
  interpretUnsigned,
  type BitPattern,
  type Reading,
  type WordWidth,
} from "../domain/model";
import { parseTwosComplementScenario } from "../lesson/scenario";
import { getTwosComplementExamples } from "../lesson/examples";
import { createTwosComplementLessonState, transitionTwosComplementLesson } from "../lesson/state";
import "./twos-complement.css";

function signedNumber(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : String(value);
}

function readingLabel(reading: Reading): string {
  return reading === "signed" ? "有符号" : "无符号";
}

function exampleDescription(id: string): string {
  return (
    {
      "signed-boundary": "有符号上界。",
      "carry-only": "最高位进位与有符号溢出。",
      "negative-overflow": "有符号下界。",
    }[id] ?? "固定宽度逐列加法。"
  );
}

function WordBits({
  name,
  pattern,
  width,
  reading,
  onToggle,
}: {
  name: "A" | "B";
  pattern: BitPattern;
  width: WordWidth;
  reading: Reading;
  onToggle: (msbIndex: number) => void;
}) {
  const weights = bitWeights(width, reading);
  const signed = interpretSigned(pattern);
  const unsigned = interpretUnsigned(pattern);

  return (
    <section className="twos-word" aria-label={`操作数 ${name}`}>
      <div className="twos-word-heading">
        <div>
          <p className="eyebrow">操作数 {name}</p>
          <h3>可编辑的 {width} 位字</h3>
        </div>
        <code>{pattern}</code>
      </div>
      <div
        aria-label={`${name} 位，从最高有效位开始`}
        className={`twos-bit-row twos-bit-row-${width}`}
      >
        {[...pattern].map((bit, index) => {
          const position = width - index - 1;
          return (
            <button
              aria-label={`${name}，第 ${position} 位，${bit}`}
              className="twos-bit-button"
              key={`${name}-${position}`}
              onClick={() => onToggle(index)}
              type="button"
            >
              <span className="twos-bit-position">第 {position} 位</span>
              <strong>{bit}</strong>
              <span className="twos-bit-weight">{weights[index]}</span>
            </button>
          );
        })}
      </div>
      <dl className="twos-word-readings">
        <div>
          <dt>无符号</dt>
          <dd>{unsigned}</dd>
        </div>
        <div>
          <dt>二进制补码</dt>
          <dd>{signedNumber(signed)}</dd>
        </div>
      </dl>
    </section>
  );
}

function SegmentControl<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="twos-control-group">
      <span>{label}</span>
      <div aria-label={label} className="twos-segment" role="group">
        {options.map((option) => (
          <button
            aria-pressed={value === option.value}
            disabled={option.disabled}
            className={value === option.value ? "is-active" : ""}
            key={String(option.value)}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TwosComplementContent({ search }: { search: Record<string, unknown> }) {
  const scenario = useMemo(() => parseTwosComplementScenario(search), [search]);
  const [lesson, dispatch] = useReducer(
    transitionTwosComplementLesson,
    scenario,
    createTwosComplementLessonState,
  );
  const model = useMemo(
    () => deriveIntegerModel({ width: lesson.width, left: lesson.left, right: lesson.right }),
    [lesson.left, lesson.right, lesson.width],
  );

  useEffect(() => {
    dispatch({ type: "load-scenario", scenario });
  }, [scenario.left, scenario.reading, scenario.right, scenario.width]);

  const active = lesson.reading === "signed" ? model.signed : model.unsigned;
  const carryDifference = model.signCarriesDiffer;
  const negativeOnePattern = "1".repeat(lesson.width);
  const examples = getTwosComplementExamples(lesson.width);

  return (
    <LabShell eyebrow="整数 / 01" subtitle="固定宽度整数与逐位进位" title="二进制补码">
      <div className="twos-course">
        <header className="twos-intro">
          <h2>
            <code>0111 + 0001</code> 的位模式与数值
          </h2>
          <p>
            这台机器只存 {lesson.width} 个 bit；位模式可按有符号或无符号读取，进位与溢出分别显示。
          </p>
        </header>

        <div className="twos-layout">
          <aside className="twos-controls" aria-label="机器控制">
            <section className="twos-card">
              <p className="eyebrow">机器</p>
              <h3>选择位宽</h3>
              <SegmentControl<WordWidth>
                label="字宽"
                onChange={(width) => dispatch({ type: "set-width", width })}
                options={[
                  { value: 4, label: "4 位" },
                  {
                    value: 8,
                    label: lesson.detailsRevealed ? "8 位" : "8 位（展开后）",
                    disabled: !lesson.detailsRevealed,
                  },
                ]}
                value={lesson.width}
              />
              <SegmentControl<Reading>
                label="当前读法"
                onChange={(reading) => dispatch({ type: "set-reading", reading })}
                options={[
                  { value: "signed", label: "有符号" },
                  { value: "unsigned", label: "无符号" },
                ]}
                value={lesson.reading}
              />
              <p className="twos-resize-note">
                扩展时，有符号字进行符号扩展，无符号字补零；缩小时保留低位并截去高位。
              </p>
              <dl className="twos-ranges">
                <div>
                  <dt>无符号范围</dt>
                  <dd>
                    {model.unsigned.range[0]}…{model.unsigned.range[1]}
                  </dd>
                </div>
                <div>
                  <dt>有符号范围</dt>
                  <dd>
                    {signedNumber(model.signed.range[0])}…{signedNumber(model.signed.range[1])}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="twos-card">
              <p className="eyebrow">引导示例</p>
              <h3>改变字，不改变规则</h3>
              <div className="twos-example-list">
                {examples.map((example) => (
                  <button
                    key={example.id}
                    onClick={() => dispatch({ type: "apply-example", example: example.id })}
                    type="button"
                  >
                    <strong>{example.label}</strong>
                    <span>{exampleDescription(example.id)}</span>
                  </button>
                ))}
              </div>
              <button
                className="twos-reset"
                onClick={() => dispatch({ type: "reset" })}
                type="button"
              >
                恢复初始情境
              </button>
            </section>
          </aside>

          <div className="twos-main">
            <section className="twos-card twos-words-card" aria-labelledby="words-heading">
              <div className="twos-card-heading">
                <div>
                  <p className="eyebrow">字表示</p>
                  <h3 id="words-heading">位模式的读法</h3>
                </div>
                <span className="twos-reading-chip">当前读法：{readingLabel(lesson.reading)}</span>
              </div>
              <div className="twos-words-grid">
                <WordBits
                  name="A"
                  onToggle={(msbIndex) =>
                    dispatch({ type: "toggle-bit", operand: "left", msbIndex })
                  }
                  pattern={lesson.left}
                  reading={lesson.reading}
                  width={lesson.width}
                />
                <span aria-hidden="true" className="twos-plus">
                  +
                </span>
                <WordBits
                  name="B"
                  onToggle={(msbIndex) =>
                    dispatch({ type: "toggle-bit", operand: "right", msbIndex })
                  }
                  pattern={lesson.right}
                  reading={lesson.reading}
                  width={lesson.width}
                />
              </div>
              <p className="twos-negation-note">
                在这个字模型中，<code>{negativeOnePattern}</code> 读作 −1；二进制补码取反会在固定
                宽度内翻转每一位并加一。
              </p>
            </section>

            <section
              className="twos-card twos-sign-conflict-card"
              aria-labelledby="sign-conflict-heading"
            >
              <p className="eyebrow">第一层：先读符号位</p>
              <h3 id="sign-conflict-heading">符号位与大小的冲突</h3>
              <p>
                最高位同时决定有符号位的负权重；同一个结果字 {model.result} 按无符号读作{" "}
                {model.unsigned.result}，按补码读作 {signedNumber(model.signed.result)}。
              </p>
              <strong>
                {model.signed.overflow
                  ? "同号输入得到相反符号：先注意到符号位与数值范围发生冲突。"
                  : "先确认符号位的读法，再观察结果是否仍在有符号范围内。"}
              </strong>
              {!lesson.detailsRevealed ? (
                <button
                  className="twos-reveal-button"
                  onClick={() => dispatch({ type: "reveal-details" })}
                  type="button"
                >
                  展开进位与溢出证据
                </button>
              ) : null}
            </section>

            {lesson.detailsRevealed ? (
              <section className="twos-card" aria-labelledby="ripple-heading">
                <div className="twos-card-heading">
                  <div>
                    <p className="eyebrow">逐位加法</p>
                    <h3 id="ripple-heading">每一列都处理 A、B 和输入进位</h3>
                  </div>
                  <span className="twos-direction">
                    从左到右：最高位 → 最低位 · 进位方向：最低位 → 最高位
                  </span>
                </div>
                <div className="twos-trace-wrap">
                  <div
                    aria-label="逐位进位列记录"
                    className={`twos-trace twos-trace-${lesson.width}`}
                    role="group"
                  >
                    <div className="twos-trace-labels">
                      <span>位置</span>
                      <span>输入进位</span>
                      <span>A</span>
                      <span>B</span>
                      <span>结果</span>
                      <span>输出进位</span>
                    </div>
                    <div className="twos-carry-out" data-carry-out={model.carryOut} role="note">
                      <span>在 {lesson.width} 位字之外</span>
                      <strong>输出进位 = {model.carryOut}</strong>
                      <small>来自最高有效位；不会存入结果</small>
                    </div>
                    {model.columns.map((column) => (
                      <div className="twos-trace-column" key={column.bitPosition}>
                        <span>第 {column.bitPosition} 位</span>
                        <strong>{column.carryIn}</strong>
                        <strong>{column.left}</strong>
                        <strong>{column.right}</strong>
                        <strong className="twos-result-bit">{column.result}</strong>
                        <strong>{column.carryOut}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {lesson.detailsRevealed ? (
              <section className="twos-evidence-grid" aria-label="结果与计算过程">
                <article className="twos-card twos-result-card">
                  <p className="eyebrow">存储结果</p>
                  <code>{model.result}</code>
                  <p>
                    精确的 {lesson.width} 位字：只保留结果的低 {lesson.width} 位。
                  </p>
                  <dl>
                    <div>
                      <dt>无符号</dt>
                      <dd>{model.unsigned.result}</dd>
                    </div>
                    <div>
                      <dt>二进制补码</dt>
                      <dd>{signedNumber(model.signed.result)}</dd>
                    </div>
                  </dl>
                  <strong className="twos-primary-sentence">
                    按{readingLabel(lesson.reading)}解释：{signedNumber(active.left)} +{" "}
                    {signedNumber(active.right)} 存储为 {signedNumber(active.result)}。
                  </strong>
                </article>

                <article className="twos-card twos-evidence-card" data-carry-out={model.carryOut}>
                  <p className="eyebrow">无符号结果</p>
                  <h3>输出进位：{model.carryOut ? "有" : "无"}</h3>
                  <p>
                    {model.unsigned.left} + {model.unsigned.right} ={" "}
                    {model.unsigned.mathematicalSum}； 有限无符号范围是 {model.unsigned.range[0]}…
                    {model.unsigned.range[1]}。
                  </p>
                  <strong>
                    {model.unsigned.overflow
                      ? "无符号和超出字范围；额外进位位于存储字之外。"
                      : "无符号和仍在范围内；没有额外进位离开这个字。"}
                  </strong>
                </article>

                <article
                  className="twos-card twos-evidence-card"
                  data-signed-overflow={model.signed.overflow}
                >
                  <p className="eyebrow">有符号结果</p>
                  <h3>有符号溢出：{model.signed.overflow ? "有" : "无"}</h3>
                  <p>
                    {signedNumber(model.signed.left)} + {signedNumber(model.signed.right)} ={" "}
                    {signedNumber(model.signed.mathematicalSum)}；有符号范围是{" "}
                    {signedNumber(model.signed.range[0])}…{signedNumber(model.signed.range[1])}。
                  </p>
                  <strong>
                    符号位输入进位 {model.carryIntoSign} {carryDifference ? "≠" : "="} 输出进位{" "}
                    {model.carryOut}.{" "}
                    {model.signed.overflow
                      ? "同号输入产生了相反符号的结果。"
                      : "符号位的输入和输出进位一致，因此有符号结果没有溢出。"}
                  </strong>
                </article>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </LabShell>
  );
}

export function TwosComplementPage() {
  const search = useSearch({ from: "/labs/twos-complement" });
  return <TwosComplementContent search={search} />;
}
