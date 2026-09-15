/**
 * Test results panel. Public debug cases run locally; hidden cases come
 * back from the judge. Expected and actual values are rendered through
 * the stage's declared buses so a case reads as MSB-first binary numbers
 * (with decimal readings), not as scattered pin assignments. Bits that
 * differ from the expectation get a <mark>, not just a color. Pins not
 * covered by any bus still appear as `pin=值` so nothing is lost.
 */

import { readBus } from "../domain/bus";
import type { Bit } from "../domain/graph";
import type { BusDef, StageDef } from "../domain/stages";
import type { JudgeOutcome, RunOutcome } from "../lesson/state";
import { AnnotatedText } from "./CalculatorTerms";

const ERROR_HINTS: Record<string, string> = {
  cycle: "电路里存在环路（输出绕回了自己的输入），无法求值。",
  unresolved: "有输出引脚没有被驱动。",
  depth: "自定义组件嵌套层数过多。",
};

function busesFor(stage: StageDef | undefined, role: BusDef["role"]): BusDef[] {
  return (stage?.buses ?? []).filter((bus) => bus.role === role);
}

/** One bus read against a case's pin values, MSB first + decimal. */
function CaseBusValue({
  bus,
  values,
  compareTo,
}: {
  bus: BusDef;
  values: Record<string, Bit | null>;
  compareTo?: Record<string, Bit>;
}) {
  const reading = readBus(bus, values);
  return (
    <span className="case-bus">
      <span className="case-bus-name">
        <AnnotatedText text={bus.name} />
      </span>
      <code aria-label={`${bus.name} ${reading.text}`} className="case-bus-bits">
        {bus.pins.map((pin, i) => {
          const bit = reading.bits[i];
          const differs =
            compareTo != null && compareTo[pin] !== undefined && bit !== compareTo[pin];
          return differs ? (
            <mark key={pin}>{bit ?? "?"}</mark>
          ) : (
            <span key={pin}>{bit ?? "?"}</span>
          );
        })}
      </code>
      <span className="case-bus-number">（{reading.unsigned ?? "—"}）</span>
      {bus.signed ? (
        <span className="case-bus-number">（补码 {reading.signed ?? "—"}）</span>
      ) : null}
    </span>
  );
}

/** All buses of one role, plus bare pins no bus covers. */
function CaseValues({
  buses,
  values,
  compareTo,
}: {
  buses: BusDef[];
  values: Record<string, Bit | null>;
  compareTo?: Record<string, Bit>;
}) {
  const covered = new Set(buses.flatMap((bus) => bus.pins));
  const bare = Object.keys(values).filter((pin) => !covered.has(pin));
  return (
    <span className="case-values">
      {buses.map((bus) => (
        <CaseBusValue bus={bus} compareTo={compareTo} key={bus.name} values={values} />
      ))}
      {bare.length > 0 ? (
        <code className="case-pins">
          {bare.map((pin) => `${pin}=${values[pin] ?? "—"}`).join(" ")}
        </code>
      ) : null}
    </span>
  );
}

/** Short "0110（6）" phrase per output bus for the counterexample sentence. */
function busPhrase(buses: BusDef[], values: Record<string, Bit | null>): string {
  return buses
    .map((bus) => {
      const reading = readBus(bus, values);
      const number = `${reading.text}（${reading.unsigned ?? "—"}）`;
      return buses.length > 1 ? `${bus.name} ${number}` : number;
    })
    .join("，");
}

function CounterexampleBlock({
  stage,
  counterexample,
}: {
  stage: StageDef | undefined;
  counterexample: NonNullable<NonNullable<JudgeOutcome>["counterexample"]>;
}) {
  const inputBuses = busesFor(stage, "input");
  const outputBuses = busesFor(stage, "output");
  return (
    <div className="test-counterexample">
      <p className="eyebrow">最小反例</p>
      <dl className="counterexample-rows">
        <div>
          <dt>用例</dt>
          <dd>
            {counterexample.name}（<AnnotatedText text={counterexample.category} />）
          </dd>
        </div>
        <div>
          <dt>输入</dt>
          <dd>
            <CaseValues buses={inputBuses} values={counterexample.inputs} />
          </dd>
        </div>
        <div>
          <dt>期望</dt>
          <dd>
            <CaseValues buses={outputBuses} values={counterexample.expected} />
          </dd>
        </div>
        <div>
          <dt>实际</dt>
          <dd>
            <CaseValues
              buses={outputBuses}
              compareTo={counterexample.expected}
              values={counterexample.actual}
            />
          </dd>
        </div>
      </dl>
      <p className="counterexample-note">
        这一组输入下，你的电路给出 {busPhrase(outputBuses, counterexample.actual)}
        ，应为 {busPhrase(outputBuses, counterexample.expected)}。
      </p>
    </div>
  );
}

export function TestPanel({
  stage,
  runOutcome,
  judgeOutcome,
}: {
  stage: StageDef | undefined;
  runOutcome: RunOutcome;
  judgeOutcome: JudgeOutcome;
}) {
  const outputBuses = busesFor(stage, "output");

  if (judgeOutcome) {
    const failedCategories = Object.entries(judgeOutcome.categories).filter(
      ([, bucket]) => bucket.passed < bucket.total,
    );
    return (
      <section aria-label="提交结果" className="test-panel">
        <header className={`test-verdict${judgeOutcome.passed ? " is-pass" : " is-fail"}`}>
          <strong>{judgeOutcome.passed ? "通过" : "未通过"}</strong>
          <span className="test-score">
            {judgeOutcome.score} / {judgeOutcome.total}
          </span>
          <span className="test-note">隐藏用例（服务器判定）</span>
        </header>

        {judgeOutcome.error ? (
          <p className="test-error" role="alert">
            {ERROR_HINTS[judgeOutcome.error.split(":")[0]] ?? judgeOutcome.error}
          </p>
        ) : null}

        {failedCategories.length > 0 ? (
          <div className="test-categories">
            <p className="eyebrow">失败的用例类别</p>
            <ul>
              {failedCategories.map(([category, bucket]) => (
                <li key={category}>
                  <span className="category-name">
                    <AnnotatedText text={category} />
                  </span>
                  <span className="category-score">
                    {bucket.passed} / {bucket.total}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {judgeOutcome.counterexample ? (
          <CounterexampleBlock counterexample={judgeOutcome.counterexample} stage={stage} />
        ) : null}
      </section>
    );
  }

  if (!runOutcome) {
    return (
      <section aria-label="测试结果" className="test-panel is-empty">
        <p>点击「运行公开测试」在本地快速验证，确认无误后再提交。</p>
      </section>
    );
  }

  return (
    <section aria-label="测试结果" className="test-panel">
      <header
        className={`test-verdict${runOutcome.score === runOutcome.total ? " is-pass" : " is-fail"}`}
      >
        <strong>公开测试</strong>
        <span className="test-score">
          {runOutcome.score} / {runOutcome.total}
        </span>
        <span className="test-note">公开用例仅供调试，不影响解锁</span>
      </header>

      <table className="test-table">
        <caption className="sr-only">公开测试用例结果</caption>
        <thead>
          <tr>
            <th scope="col">用例</th>
            <th scope="col">结果</th>
            <th scope="col">期望</th>
            <th scope="col">实际</th>
          </tr>
        </thead>
        <tbody>
          {runOutcome.results.map((result) => (
            <tr className={result.passed ? "is-pass" : "is-fail"} key={result.name}>
              <th scope="row">
                <AnnotatedText text={result.name} />
              </th>
              <td>{result.passed ? "✓" : "×"}</td>
              <td>
                <CaseValues buses={outputBuses} values={result.expected} />
              </td>
              <td>
                {result.error ? (
                  <code>{ERROR_HINTS[result.error.kind] ?? result.error.kind}</code>
                ) : (
                  <CaseValues
                    buses={outputBuses}
                    compareTo={result.expected}
                    values={result.actual}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
