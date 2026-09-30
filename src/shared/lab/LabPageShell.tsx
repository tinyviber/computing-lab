import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "../ui/Icon";

/**
 * The rail|workspace shell every lab page sits inside. Owns the grid columns,
 * the rail's collapse toggle, and per-lab persistence — the rail itself stays
 * a plain ReactNode passed by the page, so stage semantics never enter shared
 * code. Below the shared 960px breakpoint the grid stacks and the toggle is
 * hidden: collapse is a wide-screen affordance only.
 */

export type LabPageShellProps = {
  /** Lab id — namespaces the localStorage collapse key (`computing-lab:lab-rail:<labId>`). */
  labId: string;
  /** The page's rail element, rendered as-is. */
  rail: ReactNode;
  /** Vertical-strip label shown while collapsed (e.g. 当前关卡). */
  collapsedLabel?: ReactNode;
  /** Expanded rail column width in px; labs keep their historical 220–240. */
  railWidth?: number;
  /** Extra class on the grid root — "page-content" for the standard centered page. */
  contentClassName?: string;
  /** Override that keeps the rail expanded (e.g. a coach highlighting rail content). */
  forceExpand?: boolean;
  children: ReactNode;
};

function storageKey(labId: string) {
  return `computing-lab:lab-rail:${labId}`;
}

function readCollapsed(labId: string): boolean {
  try {
    return localStorage.getItem(storageKey(labId)) === "1";
  } catch {
    return false;
  }
}

export function LabPageShell({
  labId,
  rail,
  collapsedLabel,
  railWidth = 240,
  contentClassName = "page-content",
  forceExpand = false,
  children,
}: LabPageShellProps) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(labId));
  const effective = collapsed && !forceExpand;
  const scrollId = useId();

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey(labId), next ? "1" : "0");
      } catch {
        // storage unavailable — collapse still works for this mount
      }
      return next;
    });
  };

  return (
    <div
      className={`lab-page-grid ${contentClassName}${effective ? " is-collapsed" : ""}`}
      style={{ "--rail-w": `${railWidth}px` } as CSSProperties}
    >
      <div className="lab-rail-zone">
        <div className="lab-rail-bar">
          <button
            aria-controls={scrollId}
            aria-expanded={!effective}
            aria-label={effective ? "展开关卡栏" : "收起关卡栏"}
            className="lab-rail-toggle"
            onClick={toggle}
            title={effective ? "展开关卡栏" : "收起关卡栏"}
            type="button"
          >
            <Icon name={effective ? "chevron-right" : "chevron-left"} size={14} />
          </button>
          {effective && collapsedLabel ? (
            <span className="lab-rail-bar-label">{collapsedLabel}</span>
          ) : null}
        </div>
        <div className="lab-rail-scroll" id={scrollId}>
          {rail}
        </div>
      </div>
      {children}
    </div>
  );
}
