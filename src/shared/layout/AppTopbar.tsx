import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AccountMenu } from "../auth";
import "./app-layout.css";

export type AppTopbarProps = {
  children?: ReactNode;
  context?: ReactNode;
  leading?: ReactNode;
  nav?: ReactNode;
  showAccount?: boolean;
  subtitle?: ReactNode;
  title?: string;
};

export function AppTopbar({
  children,
  context,
  leading,
  nav,
  showAccount = true,
  subtitle,
  title,
}: AppTopbarProps) {
  return (
    <header className="app-topbar">
      <div className="app-topbar-left">
        {leading}
        <Link aria-label="计算实验室首页" className="app-brand-mark" to="/">
          <span aria-hidden="true">⌁</span>
        </Link>
        <div className="app-topbar-heading">
          {title ? <h1>{title}</h1> : <span className="app-brand-name">计算实验室</span>}
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {nav}
      </div>
      <div className="app-topbar-actions">
        {context}
        {children}
        {showAccount ? <AccountMenu /> : null}
      </div>
    </header>
  );
}

export function AppPageLayout({
  children,
  className,
  topbar,
  topbarProps,
}: {
  children: ReactNode;
  className?: string;
  topbar?: ReactNode;
  topbarProps?: Omit<AppTopbarProps, "children">;
}) {
  return (
    <div className={`page-layout${className ? ` ${className}` : ""}`}>
      <AppTopbar {...topbarProps}>{topbar}</AppTopbar>
      {children}
    </div>
  );
}
