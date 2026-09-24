import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { AccountRole } from "../auth";
import type { SaveStatus } from "../api/client";
import { AppPageLayout } from "../layout/AppTopbar";
import { Icon } from "../ui/Icon";

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: "",
  dirty: "未保存",
  saving: "保存中…",
  saved: "已保存",
  error: "保存失败",
};

export function SaveIndicator({ status }: { status: SaveStatus }) {
  return (
    <span aria-live="polite" className={`save-indicator is-${status}`}>
      {status === "saved" ? <Icon name="check" size={11} /> : null}
      {SAVE_LABEL[status]}
    </span>
  );
}

/**
 * Every lab page runs the same entry gates before its workspace mounts:
 * auth still loading → sign-in prompt → admin-preview labs turn teachers
 * away → a class membership is required. Renders `children` once a member
 * (or staff previewer) with a classId reaches the lab.
 */
export function LabAccessGate(props: {
  status: "loading" | "anonymous" | "authenticated";
  role: AccountRole | null;
  classId: string | undefined;
  /** Shown in the admin-preview notice, e.g. 「空间采样」. */
  labName: string;
  /** When true, class teachers see the preview notice instead of the lab. */
  adminPreview?: boolean;
  /** Admin-hidden lab: everyone but admins sees the closed notice. */
  hidden?: boolean;
  /** Extra guidance under the "你还没有加入班级" heading. */
  noClassHint?: string;
  children: ReactNode;
}) {
  const { status, role, classId, labName, adminPreview, hidden, noClassHint, children } = props;
  if (status === "loading") {
    return (
      <p className="home-loading" role="status">
        正在载入…
      </p>
    );
  }
  if (status === "anonymous") {
    return (
      <AppPageLayout>
        <main className="not-found" role="status">
          <p className="eyebrow">实验 / 需要登录</p>
          <h1>请先登录</h1>
          <div className="error-actions">
            <Link className="button button-primary" to="/login">
              去登录
            </Link>
          </div>
        </main>
      </AppPageLayout>
    );
  }
  if (hidden && role !== "admin") {
    return (
      <AppPageLayout>
        <main className="not-found" role="status">
          <p className="eyebrow">实验 / 已隐藏</p>
          <h1>这个实验暂未开放</h1>
          <p>「{labName}」已被管理员隐藏，开放后再来。</p>
        </main>
      </AppPageLayout>
    );
  }
  if (adminPreview && role === "teacher") {
    return (
      <AppPageLayout>
        <main className="not-found" role="status">
          <p className="eyebrow">实验 / 预览阶段</p>
          <h1>这个实验暂未开放</h1>
          <p>「{labName}」实验目前仅对管理员开放预览。</p>
        </main>
      </AppPageLayout>
    );
  }
  if (!classId) {
    return (
      <AppPageLayout>
        <main className="not-found" role="status">
          <p className="eyebrow">实验 / 未加入班级</p>
          <h1>你还没有加入班级</h1>
          {noClassHint ? <p>{noClassHint}</p> : null}
        </main>
      </AppPageLayout>
    );
  }
  return <>{children}</>;
}
