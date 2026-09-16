import { useState } from "react";
import { AnnotatedText } from "./CalculatorTerms";

type HintDisclosureProps = {
  hint: string;
};

type HintState = "closed" | "confirming" | "revealed";

export function HintDisclosure({ hint }: HintDisclosureProps) {
  const [state, setState] = useState<HintState>("closed");

  if (state === "revealed") {
    return (
      <div aria-label="提示" className="hint-disclosure is-revealed" role="region">
        <div className="hint-disclosure-heading">
          <span className="hint-disclosure-label">提示</span>
          <button
            className="hint-disclosure-action"
            onClick={() => setState("closed")}
            type="button"
          >
            隐藏提示
          </button>
        </div>
        <p>
          <AnnotatedText text={hint} />
        </p>
      </div>
    );
  }

  if (state === "confirming") {
    return (
      <div
        aria-labelledby="hint-confirmation-title"
        className="hint-disclosure hint-disclosure-confirmation"
        role="group"
      >
        <p id="hint-confirmation-title">确定要看提示吗？</p>
        <div className="hint-disclosure-actions">
          <button className="button button-ghost" onClick={() => setState("closed")} type="button">
            暂时不看
          </button>
          <button
            className="button button-primary"
            onClick={() => setState("revealed")}
            type="button"
          >
            确定查看
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="hint-disclosure">
      <button
        className="hint-disclosure-trigger"
        onClick={() => setState("confirming")}
        type="button"
      >
        查看提示
      </button>
    </div>
  );
}
