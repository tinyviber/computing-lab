import type { ReactNode } from "react";

type FormulaRow = { label: string; value: ReactNode };

type FormulaPanelProps = {
  title?: string;
  rows: FormulaRow[];
  className?: string;
};

export function FormulaPanel({ title = "FORMULA", rows, className = "" }: FormulaPanelProps) {
  return (
    <div className={`calculation-card formula-panel ${className}`.trim()}>
      <p className="eyebrow formula-title">{title}</p>
      {rows.map((row) => (
        <div className="calculation-row" key={row.label}>
          <span>{row.label}</span>
          <code>{row.value}</code>
        </div>
      ))}
    </div>
  );
}
