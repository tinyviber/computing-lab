import { Link, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { describeApiError } from "../../shared/api/client";
import { isStaffRole, ROLE_LABELS, useAuth } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import "./profile.css";

export function ProfilePage() {
  const { status, session, changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === "loading") {
    return (
      <p className="home-loading" role="status">
        正在载入…
      </p>
    );
  }
  if (status === "anonymous") return <Navigate replace to="/login" />;

  const minLength = isStaffRole(session.user.role) ? 8 : 4;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (newPassword !== confirmation) {
      setError("两次输入的新密码不一致。");
      return;
    }
    if (newPassword.length < minLength || newPassword.length > 128) {
      setError(`新密码至少 ${minLength} 位，最多 128 位。`);
      return;
    }
    setBusy(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setSuccess("密码已更新，下次登录请使用新密码。");
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppPageLayout
      className="profile-page"
      topbar={
        <Link className="profile-back" to="/">
          返回首页
        </Link>
      }
    >
      <main className="page-content profile-main" aria-labelledby="profile-title">
        <section className="profile-intro">
          <p className="eyebrow">账户 / PROFILE</p>
          <h1 id="profile-title">个人资料</h1>
          <p>查看你的账户信息，或更新用于登录计算实验室的密码。</p>
        </section>

        <div className="profile-grid">
          <section className="profile-card" aria-labelledby="identity-title">
            <div className="profile-card-heading">
              <div>
                <p className="eyebrow">ACCOUNT</p>
                <h2 id="identity-title">账户信息</h2>
              </div>
            </div>
            <dl className="profile-details">
              <div>
                <dt>姓名</dt>
                <dd>{session.user.name}</dd>
              </div>
              <div>
                <dt>学号</dt>
                <dd>{session.user.studentNo}</dd>
              </div>
              <div>
                <dt>角色</dt>
                <dd>{ROLE_LABELS[session.user.role]}</dd>
              </div>
              <div>
                <dt>所在班级</dt>
                <dd>
                  {session.memberships.map((membership) => membership.className).join("、") || "—"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="profile-card" aria-labelledby="password-title">
            <div className="profile-card-heading">
              <div>
                <p className="eyebrow">SECURITY</p>
                <h2 id="password-title">修改密码</h2>
              </div>
            </div>
            <form className="profile-form" onSubmit={onSubmit}>
              <label>
                当前密码
                <input
                  autoComplete="current-password"
                  name="currentPassword"
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                  type="password"
                  value={currentPassword}
                />
              </label>
              <label>
                新密码
                <input
                  autoComplete="new-password"
                  name="newPassword"
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  type="password"
                  value={newPassword}
                />
              </label>
              <label>
                确认新密码
                <input
                  autoComplete="new-password"
                  name="confirmation"
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                  type="password"
                  value={confirmation}
                />
              </label>
              <p className="profile-form-note">
                密码长度为 {minLength}～128 位，不能与当前密码相同。
              </p>
              {error ? (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              ) : null}
              {success ? (
                <p className="profile-success" role="status">
                  {success}
                </p>
              ) : null}
              <button className="button button-primary" disabled={busy} type="submit">
                {busy ? "保存中…" : "更新密码"}
              </button>
            </form>
          </section>
        </div>
      </main>
    </AppPageLayout>
  );
}
