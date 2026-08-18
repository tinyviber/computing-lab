import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLabNavigationItems } from "./LabNavigationProvider";
import "./lab.css";

type LabShellProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
};

type LabNavigationProps = {
  labNavigationItems: ReturnType<typeof useLabNavigationItems>;
  isMobile: boolean;
  pathname: string;
  railOpen: boolean;
  setRailOpen: (open: boolean) => void;
};

function LabNavigation({
  labNavigationItems,
  isMobile,
  pathname,
  railOpen,
  setRailOpen,
}: LabNavigationProps) {
  return (
    <aside
      aria-label="实验导航"
      aria-hidden={isMobile && !railOpen}
      className={`workflow-rail lab-navigation${railOpen ? " is-open" : ""}`}
      id="lab-navigation"
      inert={isMobile && !railOpen ? true : undefined}
    >
      <div className="rail-heading">
        <div>
          <p className="eyebrow">计算实验室</p>
          <h2>实验</h2>
        </div>
        <span className="rail-count">{labNavigationItems.length.toString().padStart(2, "0")}</span>
      </div>
      <nav aria-label="可用实验">
        <ul className="lab-list">
          {labNavigationItems.map((lab) => (
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
      <div className="rail-footer">
        <span className="local-dot" aria-hidden="true" />
        <div>
          <strong>本地学习空间</strong>
          <span>无需账号，也不需要联网</span>
        </div>
      </div>
    </aside>
  );
}

function RoutedLabNavigation(props: Omit<LabNavigationProps, "pathname">) {
  const pathname = useLocation({ select: (location) => location.pathname });
  return <LabNavigation {...props} pathname={pathname} />;
}

export function LabShell({ eyebrow, title, subtitle, children }: LabShellProps) {
  const labNavigationItems = useLabNavigationItems();
  const [railOpen, setRailOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

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
            aria-label={railOpen ? "关闭实验菜单" : "打开实验菜单"}
            className="mobile-menu-button"
            onClick={() => setRailOpen((open) => !open)}
            ref={menuButtonRef}
            type="button"
          >
            {railOpen ? "×" : "☰"}
          </button>
          <Link className="brand-mark" to="/" aria-label="计算实验室首页">
            CL
          </Link>
          <div>
            <h1>{title}</h1>
            <p>计算实验室 · {subtitle}</p>
          </div>
        </div>
        <div className="topbar-context">
          <span className="context-label">实验</span>
          <span className="context-value">{eyebrow}</span>
        </div>
      </header>

      {isMobile && railOpen ? (
        <button
          aria-label="关闭实验菜单"
          className="rail-scrim"
          onClick={closeRail}
          type="button"
        />
      ) : null}

      <div className="app-layout">
        <RoutedLabNavigation
          labNavigationItems={labNavigationItems}
          isMobile={isMobile}
          railOpen={railOpen}
          setRailOpen={setRailOpen}
        />

        <main className="workspace" aria-label={`${title} workspace`}>
          {children}
        </main>
      </div>
    </div>
  );
}
