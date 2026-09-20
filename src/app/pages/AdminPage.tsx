import { Link, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { API_ERROR_MESSAGES, api, describeApiError } from "../../shared/api/client";
import { useAuth, type AccountRole } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
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

type UsersPayload = { users: AdminUser[]; total: number; page: number; pageSize: number };

const PAGE_SIZE = 50;

type AdminTab = "accounts" | "classes";

type DeleteTarget = {
  label: string;
  description: string;
  endpoint: string;
};

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
        <select
          className="admin-form-select"
          name="classId"
          onChange={(e) => setClassId(e.target.value)}
          value={classId}
        >
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
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeTab, setActiveTab] = useState<AdminTab>("accounts");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const reload = useCallback(() => {
    void api
      .get<{ classes: AdminClass[] }>("/api/admin/classes")
      .then((payload) => setClasses(payload.classes))
      .catch((caught) => setError(describeApiError(caught)));
    void api
      .get<UsersPayload>(`/api/admin/users?page=${page}&pageSize=${PAGE_SIZE}`)
      .then((payload) => {
        if (payload.users.length === 0 && payload.page > 1) {
          setPage(payload.page - 1);
          return;
        }
        setUsers(payload.users);
        setTotal(payload.total);
        setPage(payload.page);
      })
      .catch((caught) => setError(describeApiError(caught)));
  }, [page]);

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

  const cancelReset = useCallback(() => {
    setResetTarget(null);
    setResetPassword("");
  }, []);

  const submitReset = useCallback(
    (user: AdminUser) => {
      const password = resetPassword;
      void run(async () => {
        await api.put(`/api/admin/users/${user.id}/password`, { password });
        setResetTarget(null);
        setResetPassword("");
      });
    },
    [resetPassword, run],
  );

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    void run(async () => {
      await api.del(target.endpoint);
      setDeleteTarget(null);
    });
  }, [deleteTarget, run]);

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
    <AppPageLayout
      className="admin-page"
      topbar={
        <Link className="profile-back" to="/">
          返回首页
        </Link>
      }
    >
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

        <div aria-label="管理模块" className="admin-tabs" role="tablist">
          <button
            aria-controls="admin-accounts-panel"
            aria-selected={activeTab === "accounts"}
            className={`admin-tab${activeTab === "accounts" ? " is-active" : ""}`}
            id="admin-accounts-tab"
            onClick={() => setActiveTab("accounts")}
            role="tab"
            type="button"
          >
            账号管理
            <span>创建、导入、角色和密码</span>
          </button>
          <button
            aria-controls="admin-classes-panel"
            aria-selected={activeTab === "classes"}
            className={`admin-tab${activeTab === "classes" ? " is-active" : ""}`}
            id="admin-classes-tab"
            onClick={() => setActiveTab("classes")}
            role="tab"
            type="button"
          >
            班级管理
            <span>班级、邀请码和成员数</span>
          </button>
        </div>

        <div
          aria-labelledby="admin-accounts-tab"
          className={`admin-grid${activeTab === "accounts" ? "" : " is-hidden"}`}
          hidden={activeTab !== "accounts"}
          id="admin-accounts-panel"
          role="tabpanel"
        >
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

          <section className="profile-card admin-users-card" aria-labelledby="users-title">
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
                  <th scope="col">操作</th>
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
                        className="admin-role-select admin-table-select"
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
                      <span className="admin-class-chips">
                        {user.classes.length === 0 ? "—" : null}
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
                        {classes.filter(
                          (klass) => !user.classes.some((m) => m.classId === klass.id),
                        ).length > 0 ? (
                          <select
                            aria-label={`把 ${user.name} 加入班级`}
                            className="admin-role-select admin-table-select"
                            disabled={busy}
                            onChange={(e) => {
                              const classId = e.target.value;
                              if (classId) {
                                void run(() =>
                                  api.put(`/api/admin/classes/${classId}/members/${user.id}`),
                                );
                              }
                            }}
                            value=""
                          >
                            <option value="">＋ 加入班级</option>
                            {classes
                              .filter((klass) => !user.classes.some((m) => m.classId === klass.id))
                              .map((klass) => (
                                <option key={klass.id} value={klass.id}>
                                  {klass.name}
                                </option>
                              ))}
                          </select>
                        ) : null}
                      </span>
                    </td>
                    <td>
                      {resetTarget === user.id ? (
                        <span className="admin-reset-form">
                          <input
                            aria-label={`${user.name} 的新密码`}
                            autoComplete="new-password"
                            className="admin-reset-input"
                            disabled={busy}
                            onChange={(e) => setResetPassword(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && resetPassword.length >= 4) {
                                submitReset(user);
                              } else if (e.key === "Escape") {
                                cancelReset();
                              }
                            }}
                            placeholder="新密码（至少 4 位）"
                            type="password"
                            value={resetPassword}
                          />
                          <button
                            className="button button-ghost admin-inline-button"
                            disabled={busy || resetPassword.length < 4}
                            onClick={() => submitReset(user)}
                            type="button"
                          >
                            确定
                          </button>
                          <button
                            className="button button-ghost admin-inline-button"
                            disabled={busy}
                            onClick={cancelReset}
                            type="button"
                          >
                            取消
                          </button>
                        </span>
                      ) : (
                        <span className="admin-actions">
                          <button
                            className="button button-ghost admin-inline-button"
                            disabled={busy || user.id === session?.user.id}
                            onClick={() => setResetTarget(user.id)}
                            title={
                              user.id === session?.user.id
                                ? "请在个人设置里修改自己的密码"
                                : "重置该账号的密码，其登录会话将失效"
                            }
                            type="button"
                          >
                            重置密码
                          </button>
                          <button
                            className="button button-ghost admin-inline-button admin-danger"
                            disabled={busy || user.id === session?.user.id}
                            onClick={() =>
                              setDeleteTarget({
                                label: `账号「${user.name}」`,
                                description: `删除后，${user.studentNo} 的班级关系、登录会话和做题记录都会被一并删除。`,
                                endpoint: `/api/admin/users/${user.id}`,
                              })
                            }
                            title={
                              user.id === session?.user.id
                                ? "不能删除自己的账号"
                                : "删除该账号及其全部数据"
                            }
                            type="button"
                          >
                            删除
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5}>还没有账号。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <div className="admin-pagination">
              <span className="admin-pagination-info">
                共 {total} 个账号 · 第 {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))} 页
              </span>
              <button
                className="button button-ghost admin-inline-button"
                disabled={busy || page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                type="button"
              >
                上一页
              </button>
              <button
                className="button button-ghost admin-inline-button"
                disabled={busy || page >= Math.ceil(total / PAGE_SIZE)}
                onClick={() => setPage((p) => p + 1)}
                type="button"
              >
                下一页
              </button>
            </div>
          </section>
        </div>

        <div
          aria-labelledby="admin-classes-tab"
          className={`admin-grid admin-grid-single${activeTab === "classes" ? "" : " is-hidden"}`}
          hidden={activeTab !== "classes"}
          id="admin-classes-panel"
          role="tabpanel"
        >
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
                        onClick={() =>
                          setDeleteTarget({
                            label: `班级「${klass.name}」`,
                            description: "删除后，这个班级和邀请码将不再可用。",
                            endpoint: `/api/admin/classes/${klass.id}`,
                          })
                        }
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
        </div>

        {deleteTarget ? (
          <div className="admin-modal-backdrop" role="presentation">
            <section
              aria-labelledby="admin-delete-title"
              aria-modal="true"
              className="admin-modal"
              role="dialog"
            >
              <p className="eyebrow">确认操作</p>
              <h2 id="admin-delete-title">确定删除{deleteTarget.label}？</h2>
              <p>{deleteTarget.description}</p>
              <div className="admin-modal-actions">
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => setDeleteTarget(null)}
                  type="button"
                >
                  取消
                </button>
                <button
                  className="button button-danger"
                  disabled={busy}
                  onClick={confirmDelete}
                  type="button"
                >
                  {busy ? "删除中…" : "确认删除"}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </AppPageLayout>
  );
}
