import { Link, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { API_ERROR_MESSAGES, api, describeApiError } from "../../shared/api/client";
import { AccountMenu, useAuth, type AccountRole } from "../../shared/auth";
import "./admin.css";

type AdminClass = { id: string; name: string; inviteCode: string; memberCount: number };

type AdminUser = {
  id: string;
  studentNo: string;
  name: string;
  role: AccountRole;
  createdAt: string;
  classes: { classId: string; className: string; role: string }[];
};

type ImportRowResult = {
  line: number;
  studentNo: string;
  status: "created" | "exists" | "error";
  error?: string;
};

type ImportSummary = { created: number; exists: number; failed: number; rows: ImportRowResult[] };

const IMPORT_HINT =
  "每行一个账号：学号,姓名,密码[,角色][,班级邀请码]。角色可选 学生/教师/管理员，留空默认为学生；也支持粘贴 JSON 数组。";

function rowErrorText(code: string | undefined): string {
  return code ? (API_ERROR_MESSAGES[code] ?? code) : "";
}

function CreateAccountForm({
  classes,
  onCreated,
}: {
  classes: AdminClass[];
  onCreated: () => void;
}) {
  const [studentNo, setStudentNo] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AccountRole>("user");
  const [classId, setClassId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      await api.post("/api/admin/users", {
        studentNo,
        name,
        password,
        role,
        classId: classId || undefined,
      });
      setStudentNo("");
      setName("");
      setPassword("");
      setRole("user");
      setClassId("");
      setSuccess("账号已创建。");
      onCreated();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="profile-form" onSubmit={onSubmit}>
      <label>
        学号
        <input
          autoComplete="off"
          name="studentNo"
          onChange={(e) => setStudentNo(e.target.value)}
          required
          value={studentNo}
        />
      </label>
      <label>
        姓名
        <input
          autoComplete="off"
          name="name"
          onChange={(e) => setName(e.target.value)}
          required
          value={name}
        />
      </label>
      <label>
        初始密码
        <input
          autoComplete="off"
          name="password"
          onChange={(e) => setPassword(e.target.value)}
          required
          value={password}
        />
      </label>
      <label>
        角色
        <select name="role" onChange={(e) => setRole(e.target.value as AccountRole)} value={role}>
          <option value="user">学生</option>
          <option value="teacher">教师</option>
          <option value="admin">管理员</option>
        </select>
      </label>
      <label>
        分配班级（可选）
        <select name="classId" onChange={(e) => setClassId(e.target.value)} value={classId}>
          <option value="">不分配</option>
          {classes.map((klass) => (
            <option key={klass.id} value={klass.id}>
              {klass.name}
            </option>
          ))}
        </select>
      </label>
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
        {busy ? "创建中…" : "创建账号"}
      </button>
    </form>
  );
}

function ImportPanel({ onImported }: { onImported: () => void }) {
  const [text, setText] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSummary(null);
    const trimmed = text.trim();
    if (!trimmed) {
      setError("请先粘贴名单或选择 CSV 文件。");
      return;
    }
    let payload: { csv: string } | { users: unknown[] };
    if (trimmed.startsWith("[")) {
      try {
        payload = { users: JSON.parse(trimmed) as unknown[] };
      } catch {
        setError("JSON 解析失败，请检查格式。");
        return;
      }
    } else {
      payload = { csv: trimmed };
    }
    setBusy(true);
    try {
      const result = await api.post<ImportSummary>("/api/admin/users/import", payload);
      setSummary(result);
      onImported();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="profile-form" onSubmit={onSubmit}>
      <label>
        名单（CSV 或 JSON）
        <textarea
          className="admin-import-text"
          name="importText"
          onChange={(e) => setText(e.target.value)}
          placeholder={"20260101,张三,pass123\n20260102,李四,pass456,学生,CLASS26"}
          rows={7}
          value={text}
        />
      </label>
      <label className="admin-file-label">
        或选择 .csv 文件
        <input
          accept=".csv,text/csv,text/plain"
          name="importFile"
          onChange={(e) => void onFile(e.target.files?.[0])}
          type="file"
        />
      </label>
      <p className="profile-form-note">{IMPORT_HINT}</p>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="button button-primary" disabled={busy} type="submit">
        {busy ? "导入中…" : "开始导入"}
      </button>

      {summary ? (
        <div className="admin-import-result" role="status">
          <p>
            新建 {summary.created} 个，已存在 {summary.exists} 个，失败 {summary.failed} 个。
          </p>
          {summary.rows.some((row) => row.status !== "created") ? (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">行</th>
                  <th scope="col">学号</th>
                  <th scope="col">结果</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows
                  .filter((row) => row.status !== "created")
                  .map((row) => (
                    <tr key={row.line}>
                      <td>{row.line}</td>
                      <td>{row.studentNo || "—"}</td>
                      <td>{row.status === "exists" ? "已存在，跳过" : rowErrorText(row.error)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

function CreateClassForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/api/admin/classes", {
        name,
        inviteCode: inviteCode || undefined,
      });
      setName("");
      setInviteCode("");
      onCreated();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="admin-class-form" onSubmit={onSubmit}>
      <label>
        班级名称
        <input name="className" onChange={(e) => setName(e.target.value)} required value={name} />
      </label>
      <label>
        邀请码（可选）
        <input
          name="inviteCode"
          onChange={(e) => setInviteCode(e.target.value)}
          placeholder="留空自动生成"
          value={inviteCode}
        />
      </label>
      <button className="button button-secondary" disabled={busy} type="submit">
        {busy ? "创建中…" : "新建班级"}
      </button>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function AdminPage() {
  const { status, role, session } = useAuth();
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    void api
      .get<{ classes: AdminClass[] }>("/api/admin/classes")
      .then((payload) => setClasses(payload.classes))
      .catch((caught) => setError(describeApiError(caught)));
    void api
      .get<{ users: AdminUser[] }>("/api/admin/users")
      .then((payload) => setUsers(payload.users))
      .catch((caught) => setError(describeApiError(caught)));
  }, []);

  useEffect(() => {
    if (status === "authenticated" && role === "admin") reload();
  }, [status, role, reload]);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setError(null);
      setBusy(true);
      try {
        await action();
        reload();
      } catch (caught) {
        setError(describeApiError(caught));
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  if (status === "loading") {
    return (
      <p className="home-loading" role="status">
        正在载入…
      </p>
    );
  }
  if (status === "anonymous") return <Navigate replace to="/login" />;
  if (role !== "admin") {
    return (
      <div className="not-found" role="status">
        <p className="eyebrow">管理 / 无权访问</p>
        <h1>只有管理员可以打开账号管理</h1>
        <div className="error-actions">
          <Link className="button button-primary" to="/">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="profile-topbar">
        <Link className="profile-brand" to="/">
          <span className="profile-brand-mark">⌁</span>
          <span>计算实验室</span>
        </Link>
        <div className="profile-topbar-actions">
          <Link className="profile-back" to="/">
            返回首页
          </Link>
          <AccountMenu />
        </div>
      </header>

      <main className="profile-main" aria-labelledby="admin-title">
        <section className="profile-intro">
          <p className="eyebrow">管理 / ADMIN</p>
          <h1 id="admin-title">账号与班级管理</h1>
          <p>手动注册已关闭。在这里创建账号、批量导入名单、管理班级和邀请码。</p>
        </section>

        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="admin-grid">
          <section className="profile-card" aria-labelledby="create-account-title">
            <div className="profile-card-heading">
              <p className="eyebrow">ACCOUNT</p>
              <h2 id="create-account-title">创建账号</h2>
            </div>
            <CreateAccountForm classes={classes} onCreated={reload} />
          </section>

          <section className="profile-card" aria-labelledby="import-title">
            <div className="profile-card-heading">
              <p className="eyebrow">IMPORT</p>
              <h2 id="import-title">批量导入账号</h2>
            </div>
            <ImportPanel onImported={reload} />
          </section>

          <section className="profile-card" aria-labelledby="classes-title">
            <div className="profile-card-heading">
              <p className="eyebrow">CLASSES</p>
              <h2 id="classes-title">班级管理</h2>
            </div>
            <CreateClassForm onCreated={reload} />
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">班级</th>
                  <th scope="col">邀请码</th>
                  <th scope="col">成员数</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((klass) => (
                  <tr key={klass.id}>
                    <td>{klass.name}</td>
                    <td>
                      <code>{klass.inviteCode}</code>
                    </td>
                    <td>{klass.memberCount}</td>
                    <td>
                      <button
                        className="button button-ghost admin-inline-button"
                        disabled={busy || klass.memberCount > 0}
                        onClick={() => {
                          if (window.confirm(`确定删除班级「${klass.name}」？`)) {
                            void run(() => api.del(`/api/admin/classes/${klass.id}`));
                          }
                        }}
                        title={klass.memberCount > 0 ? "先移除全部成员才能删除" : "删除班级"}
                        type="button"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
                {classes.length === 0 ? (
                  <tr>
                    <td colSpan={4}>还没有班级。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          <section className="profile-card" aria-labelledby="users-title">
            <div className="profile-card-heading">
              <p className="eyebrow">USERS</p>
              <h2 id="users-title">全部账号（{users.length}）</h2>
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">学号</th>
                  <th scope="col">姓名</th>
                  <th scope="col">角色</th>
                  <th scope="col">班级</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.studentNo}</td>
                    <td>{user.name}</td>
                    <td>
                      <select
                        aria-label={`${user.name} 的角色`}
                        className="admin-role-select"
                        disabled={busy || user.id === session?.user.id}
                        onChange={(e) =>
                          void run(() =>
                            api.put(`/api/admin/users/${user.id}/role`, {
                              role: e.target.value,
                            }),
                          )
                        }
                        title={
                          user.id === session?.user.id
                            ? "不能修改自己的角色"
                            : "管理员角色不能在此设置"
                        }
                        value={user.role}
                      >
                        <option value="user">学生</option>
                        <option value="teacher">教师</option>
                        <option disabled value="admin">
                          管理员
                        </option>
                      </select>
                    </td>
                    <td>
                      {user.classes.length === 0 ? (
                        "—"
                      ) : (
                        <span className="admin-class-chips">
                          {user.classes.map((m) => (
                            <span className="admin-class-chip" key={m.classId}>
                              {m.className}
                              <button
                                aria-label={`把 ${user.name} 移出 ${m.className}`}
                                className="admin-chip-remove"
                                disabled={busy}
                                onClick={() =>
                                  void run(() =>
                                    api.del(`/api/admin/classes/${m.classId}/members/${user.id}`),
                                  )
                                }
                                title="移出该班级"
                                type="button"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4}>还没有账号。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </div>
      </main>
    </div>
  );
}
