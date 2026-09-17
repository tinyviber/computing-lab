import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "../../shared/auth";
import { describeApiError } from "../../shared/api/client";
import "./auth.css";

export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const [studentNo, setStudentNo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "authenticated") void navigate({ to: "/" });
  }, [status, navigate]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login({ studentNo, password });
      await navigate({ to: "/" });
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <main className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">校内信息技术实验</p>
        <h1 id="auth-title">登录</h1>

        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            学号
            <input
              autoComplete="username"
              name="studentNo"
              onChange={(e) => setStudentNo(e.target.value)}
              required
              value={studentNo}
            />
          </label>

          <label>
            密码
            <input
              autoComplete="current-password"
              name="password"
              onChange={(e) => setPassword(e.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="button button-primary" disabled={busy} type="submit">
            {busy ? "提交中…" : "登录"}
          </button>
        </form>

        <p className="auth-note">账号由管理员统一开通，请使用下发的学号和初始密码登录。</p>
      </main>
    </div>
  );
}
