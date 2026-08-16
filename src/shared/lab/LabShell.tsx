import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LAB_NAV_ITEMS } from "./navigation";

type LabShellProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  controlsLabel?: string;
  navigation?: ReactNode;
  visualization?: ReactNode;
  controls?: ReactNode;
  explanation?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
};

type LabNavigationProps = {
  isMobile: boolean;
  navigation?: ReactNode;
  pathname: string;
  railOpen: boolean;
  setRailOpen: (open: boolean) => void;
};

function LabNavigation({
  isMobile,
  navigation,
  pathname,
  railOpen,
  setRailOpen,
}: LabNavigationProps) {
  return (
    <aside
      aria-label="Lab navigation"
      aria-hidden={isMobile && !railOpen}
      className={`workflow-rail lab-navigation${railOpen ? " is-open" : ""}`}
      id="lab-navigation"
      inert={isMobile && !railOpen ? true : undefined}
    >
      <div className="rail-heading">
        <div>
          <p className="eyebrow">COMPUTING LAB</p>
          <h2>Experiments</h2>
        </div>
        <span className="rail-count">{LAB_NAV_ITEMS.length.toString().padStart(2, "0")}</span>
      </div>
      <nav aria-label="Available labs">
        <ul className="lab-list">
          {LAB_NAV_ITEMS.map((lab) => (
            <li key={lab.id}>
              <Link
                className={`lab-link${pathname === lab.route ? " is-active" : ""}`}
                data-status={lab.status}
                onClick={() => isMobile && setRailOpen(false)}
                to={lab.route}
              >
                <span>
                  <strong>{lab.title}</strong>
                  <span>{lab.category}</span>
                </span>
                <span aria-hidden="true">{pathname === lab.route ? "●" : "○"}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {navigation}
      <div className="rail-footer">
        <span className="local-dot" aria-hidden="true" />
        <div>
          <strong>Local workspace</strong>
          <span>No account or network needed</span>
        </div>
      </div>
    </aside>
  );
}

function RoutedLabNavigation(props: Omit<LabNavigationProps, "pathname">) {
  const pathname = useLocation({ select: (location) => location.pathname });
  return <LabNavigation {...props} pathname={pathname} />;
}

export function LabShell({
  eyebrow,
  title,
  subtitle,
  controlsLabel,
  navigation,
  visualization,
  controls,
  explanation,
  actions,
  children,
}: LabShellProps) {
  const [railOpen, setRailOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const hasSlots = visualization || controls || explanation || actions;

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsMobile(mediaQuery.matches);
    onChange();
    mediaQuery.addEventListener?.("change", onChange);
    return () => mediaQuery.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    if (!railOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRailOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [railOpen]);

  const closeRail = () => {
    setRailOpen(false);
    menuButtonRef.current?.focus();
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <button
            aria-controls="lab-navigation"
            aria-expanded={railOpen}
            aria-label={railOpen ? "Close lab menu" : "Open lab menu"}
            className="mobile-menu-button"
            onClick={() => setRailOpen((open) => !open)}
            ref={menuButtonRef}
            type="button"
          >
            {railOpen ? "×" : "☰"}
          </button>
          <Link className="brand-mark" to="/" aria-label="Computing Lab home">
            CL
          </Link>
          <div>
            <h1>{title}</h1>
            <p>Computing Lab · {subtitle}</p>
          </div>
        </div>
        <div className="topbar-context">
          <span className="context-label">LAB</span>
          <span className="context-value">{eyebrow}</span>
        </div>
      </header>

      {isMobile && railOpen ? (
        <button
          aria-label="Close lab menu"
          className="rail-scrim"
          onClick={closeRail}
          type="button"
        />
      ) : null}

      <div className="app-layout">
        <RoutedLabNavigation
          isMobile={isMobile}
          navigation={navigation}
          railOpen={railOpen}
          setRailOpen={setRailOpen}
        />

        <main
          className={`workspace${hasSlots ? " lab-shell-workspace" : ""}`}
          aria-label={`${title} workspace`}
        >
          {hasSlots ? (
            <>
              {visualization ? (
                <section className="lab-visualization">{visualization}</section>
              ) : null}
              {controls || explanation || actions ? (
                <aside className="lab-controls" aria-label={controlsLabel ?? `${title} controls`}>
                  {controls}
                  {explanation ? (
                    <section className="lab-explanation">{explanation}</section>
                  ) : null}
                  {actions ? <div className="lab-actions">{actions}</div> : null}
                </aside>
              ) : null}
            </>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
