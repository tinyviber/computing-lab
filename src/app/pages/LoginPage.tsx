import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "../../shared/auth";
import { describeApiError } from "../../shared/api/client";
import "./auth.css";

type Mode = "login" | "join";

export function LoginPage() {
  const { status, login, join } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [inviteCode, setInviteCode] = useState("");
  const [studentNo, setStudentNo] = useState("");
  const [name, setName] = useState("");
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
      if (mode === "login") await login({ studentNo, password });
      else await join({ inviteCode, studentNo, name, password });
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
        <h1 id="auth-title">{mode === "login" ? "登录" : "加入班级"}</h1>

        <div className="auth-tabs" role="tablist" aria-label="登录方式">
          <button
            aria-selected={mode === "login"}
            className={mode === "login" ? "is-active" : ""}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            role="tab"
            type="button"
          >
            我已有账号
          </button>
          <button
            aria-selected={mode === "join"}
            className={mode === "join" ? "is-active" : ""}
            onClick={() => {
              setMode("join");
              setError(null);
            }}
            role="tab"
            type="button"
          >
            用邀请码加入
          </button>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          {mode === "join" ? (
            <label>
              班级邀请码
              <input
                autoComplete="off"
                name="inviteCode"
                onChange={(e) => setInviteCode(e.target.value)}
                required
                value={inviteCode}
              />
            </label>
          ) : null}

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

          {mode === "join" ? (
            <label>
              姓名
              <input
                autoComplete="name"
                name="name"
                onChange={(e) => setName(e.target.value)}
                required
                value={name}
              />
            </label>
          ) : null}

          <label>
            密码
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
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
            {busy ? "提交中…" : mode === "login" ? "登录" : "加入并开始"}
          </button>
        </form>

        <p className="auth-note">
          {mode === "login"
            ? "第一次使用请用老师给的邀请码加入班级。"
            : "加入后用同一个学号和密码登录。"}
        </p>
      </main>
    </div>
  );
}
