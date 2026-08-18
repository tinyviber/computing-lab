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
    <section className="twos-word" aria-label={`Operand ${name}`}>
      <div className="twos-word-heading">
        <div>
          <p className="eyebrow">OPERAND {name}</p>
          <h3>Editable {width}-bit word</h3>
        </div>
        <code>{pattern}</code>
      </div>
      <div
        aria-label={`${name} bits, most significant bit first`}
        className={`twos-bit-row twos-bit-row-${width}`}
      >
        {[...pattern].map((bit, index) => {
          const position = width - index - 1;
          return (
            <button
              aria-label={`${name}, bit ${position}, ${bit}`}
              className="twos-bit-button"
              key={`${name}-${position}`}
              onClick={() => onToggle(index)}
              type="button"
            >
              <span className="twos-bit-position">bit {position}</span>
              <strong>{bit}</strong>
              <span className="twos-bit-weight">{weights[index]}</span>
            </button>
          );
        })}
      </div>
      <dl className="twos-word-readings">
        <div>
          <dt>unsigned</dt>
          <dd>{unsigned}</dd>
        </div>
        <div>
          <dt>two&apos;s-complement</dt>
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
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="twos-control-group">
      <span>{label}</span>
      <div aria-label={label} className="twos-segment" role="group">
        {options.map((option) => (
          <button
            aria-pressed={value === option.value}
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
  const activeReadingName = lesson.reading === "signed" ? "two's-complement" : "unsigned";
  const carryDifference = model.signCarriesDiffer;
  const negativeOnePattern = "1".repeat(lesson.width);
  const examples = getTwosComplementExamples(lesson.width);

  return (
    <LabShell
      eyebrow="INTEGER / 01"
      subtitle="Fixed-width words and ripple carry"
      title="二进制补码"
    >
      <div className="twos-course">
        <header className="twos-intro">
          <p className="eyebrow">REFERENCE COURSE</p>
          <h2>
            为什么 <code>0111 + 0001</code> 会变成 <code>1000</code>？
          </h2>
          <p>
            这台机器只存 {lesson.width} 个 bit。改变 A 或 B 的任一位，所有读数都由同一条逐列
            ripple-carry 计算重新得出；没有提交、关卡或答案状态。
          </p>
        </header>

        <div className="twos-layout">
          <aside className="twos-controls" aria-label="Machine controls">
            <section className="twos-card">
              <p className="eyebrow">MACHINE</p>
              <h3>Choose the fixed word</h3>
              <SegmentControl<WordWidth>
                label="Word width"
                onChange={(width) => dispatch({ type: "set-width", width })}
                options={[
                  { value: 4, label: "4 bit" },
                  { value: 8, label: "8 bit" },
                ]}
                value={lesson.width}
              />
              <SegmentControl<Reading>
                label="Primary reading"
                onChange={(reading) => dispatch({ type: "set-reading", reading })}
                options={[
                  { value: "signed", label: "Signed" },
                  { value: "unsigned", label: "Unsigned" },
                ]}
                value={lesson.reading}
              />
              <p className="twos-resize-note">
                On expansion, signed words sign-extend and unsigned words zero-extend; when
                shrinking, the low bits are kept and higher bits are truncated.
              </p>
              <dl className="twos-ranges">
                <div>
                  <dt>unsigned range</dt>
                  <dd>
                    {model.unsigned.range[0]}…{model.unsigned.range[1]}
                  </dd>
                </div>
                <div>
                  <dt>signed range</dt>
                  <dd>
                    {signedNumber(model.signed.range[0])}…{signedNumber(model.signed.range[1])}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="twos-card">
              <p className="eyebrow">GUIDED EXAMPLES</p>
              <h3>Change the words, not the rules</h3>
              <div className="twos-example-list">
                {examples.map((example) => (
                  <button
                    key={example.id}
                    onClick={() => dispatch({ type: "apply-example", example: example.id })}
                    type="button"
                  >
                    <strong>{example.label}</strong>
                    <span>{example.description}</span>
                  </button>
                ))}
              </div>
              <button
                className="twos-reset"
                onClick={() => dispatch({ type: "reset" })}
                type="button"
              >
                Reset to URL scenario
              </button>
            </section>
          </aside>

          <div className="twos-main">
            <section className="twos-card twos-words-card" aria-labelledby="words-heading">
              <div className="twos-card-heading">
                <div>
                  <p className="eyebrow">WORD REPRESENTATION</p>
                  <h3 id="words-heading">Same bits; selectable primary reading</h3>
                </div>
                <span className="twos-reading-chip">primary: {activeReadingName}</span>
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
                In this word model, <code>{negativeOnePattern}</code> reads as −1; a
                two&apos;s-complement negation inverts every bit and adds one within the fixed
                width.
              </p>
            </section>

            <section className="twos-card" aria-labelledby="ripple-heading">
              <div className="twos-card-heading">
                <div>
                  <p className="eyebrow">RIPPLE ADDITION</p>
                  <h3 id="ripple-heading">Each column consumes A, B, and carry-in</h3>
                </div>
                <span className="twos-direction">
                  visual order: MSB → LSB · carry ripples LSB → MSB
                </span>
              </div>
              <div className="twos-trace-wrap">
                <div
                  aria-label="Ripple carry column trace"
                  className={`twos-trace twos-trace-${lesson.width}`}
                  role="group"
                >
                  <div className="twos-trace-labels">
                    <span>position</span>
                    <span>carry in</span>
                    <span>A</span>
                    <span>B</span>
                    <span>result</span>
                    <span>carry out</span>
                  </div>
                  <div className="twos-carry-out" data-carry-out={model.carryOut} role="note">
                    <span>outside the {lesson.width}-bit word</span>
                    <strong>carry-out = {model.carryOut}</strong>
                    <small>from the MSB; not stored in result</small>
                  </div>
                  {model.columns.map((column) => (
                    <div className="twos-trace-column" key={column.bitPosition}>
                      <span>bit {column.bitPosition}</span>
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

            <section className="twos-evidence-grid" aria-label="Result and mathematical evidence">
              <article className="twos-card twos-result-card">
                <p className="eyebrow">STORED RESULT</p>
                <code>{model.result}</code>
                <p>
                  Exact {lesson.width}-bit word: low {lesson.width} result bits only.
                </p>
                <dl>
                  <div>
                    <dt>unsigned</dt>
                    <dd>{model.unsigned.result}</dd>
                  </div>
                  <div>
                    <dt>two&apos;s-complement</dt>
                    <dd>{signedNumber(model.signed.result)}</dd>
                  </div>
                </dl>
                <strong className="twos-primary-sentence">
                  As {activeReadingName}: {signedNumber(active.left)} + {signedNumber(active.right)}{" "}
                  stores {signedNumber(active.result)}.
                </strong>
              </article>

              <article className="twos-card twos-evidence-card" data-carry-out={model.carryOut}>
                <p className="eyebrow">UNSIGNED EVIDENCE</p>
                <h3>Carry-out: {model.carryOut ? "yes" : "no"}</h3>
                <p>
                  {model.unsigned.left} + {model.unsigned.right} = {model.unsigned.mathematicalSum};
                  finite unsigned range is {model.unsigned.range[0]}…{model.unsigned.range[1]}.
                </p>
                <strong>
                  {model.unsigned.overflow
                    ? "The unsigned sum exceeds the word range; the extra carry is outside the stored word."
                    : "The unsigned sum remains in range; no extra carry leaves the word."}
                </strong>
              </article>

              <article
                className="twos-card twos-evidence-card"
                data-signed-overflow={model.signed.overflow}
              >
                <p className="eyebrow">SIGNED EVIDENCE</p>
                <h3>Signed overflow: {model.signed.overflow ? "yes" : "no"}</h3>
                <p>
                  {signedNumber(model.signed.left)} + {signedNumber(model.signed.right)} ={" "}
                  {signedNumber(model.signed.mathematicalSum)}; signed range is{" "}
                  {signedNumber(model.signed.range[0])}…{signedNumber(model.signed.range[1])}.
                </p>
                <strong>
                  sign-bit carry-in {model.carryIntoSign} {carryDifference ? "≠" : "="} carry-out{" "}
                  {model.carryOut}.{" "}
                  {model.signed.overflow
                    ? "Same-sign inputs produced a result with the other sign."
                    : "The sign-bit carries agree, so the signed result did not overflow."}
                </strong>
              </article>
            </section>
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
