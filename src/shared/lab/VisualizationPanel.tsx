import type { ReactNode } from "react";

type VisualizationPanelProps = {
  eyebrow?: string;
  meta?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function VisualizationPanel({
  eyebrow = "VISUALIZATION",
  meta,
  children,
  footer,
  className = "",
}: VisualizationPanelProps) {
  return (
    <div className={`preview-panel visualization-panel ${className}`.trim()}>
      <div className="preview-panel-header">
        <span>{eyebrow}</span>
        {meta ? <code>{meta}</code> : null}
      </div>
      {children}
      {footer ? <div className="preview-panel-footer">{footer}</div> : null}
    </div>
  );
}
