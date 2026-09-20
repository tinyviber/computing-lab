import { Link, useSearch } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAuth } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { isLabAccessible } from "../catalog/labs";
import "./home.css";

/** `?showExperimentalLabs=1` opens a hidden lab without changing the registry. */
export function isExperimentalOverride(search: Record<string, unknown>): boolean {
  const raw = search.showExperimentalLabs;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "1" || value === 1 || value === true || value === "true";
}

export function LabUnavailable({ title }: { title: string }) {
  return (
    <AppPageLayout>
      <main className="not-found" role="status">
        <p className="eyebrow">实验 / 暂未开放</p>
        <h1>{title}暂未开放</h1>
        <p>这堂课这学期没有安排。请回到首页继续当前的实验。</p>
        <div className="error-actions">
          <Link className="button button-primary" to="/">
            返回首页
          </Link>
        </div>
      </main>
    </AppPageLayout>
  );
}

/**
 * Renders a lab only when its feature flag is on, the viewer is an admin, or
 * the URL carries the experimental override. Disabled labs keep their route and
 * their code; they simply refuse to render for teachers and students.
 */
export function LabGate({
  labId,
  title,
  children,
}: {
  labId: string;
  title: string;
  children: ReactNode;
}) {
  const { role, status } = useAuth();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const showExperimental = isExperimentalOverride(search);

  if (status === "loading" && !showExperimental) {
    return (
      <p className="home-loading" role="status">
        正在载入…
      </p>
    );
  }
  if (!isLabAccessible(labId, { role, showExperimental })) {
    return <LabUnavailable title={title} />;
  }
  return <>{children}</>;
}
