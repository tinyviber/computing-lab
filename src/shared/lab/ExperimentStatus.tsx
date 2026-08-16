import type { ReactNode } from "react";
import type { LabPhase } from "./StatusMessage";

type ExperimentStatusProps = {
  phase: LabPhase;
  title: string;
  detail: string;
  icon?: ReactNode;
};

export function ExperimentStatus({ phase, title, detail, icon }: ExperimentStatusProps) {
  const failure = phase === "failure";
  return (
    <div className={`status-message status-${phase}`} role="status">
      <span className="status-icon" aria-hidden="true">
        {icon ?? (failure ? "!" : phase === "success" ? "✓" : "i")}
      </span>
      <div role={failure ? "alert" : undefined}>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}
