import { Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, describeApiError } from "../../shared/api/client";
import { useAuth } from "../../shared/auth";
import { LAB_TITLES, type LabVisibility } from "../../shared/lab/labs";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import "./admin.css";

export function AdminLabsPage() {
  const { status, role } = useAuth();
  const [labs, setLabs] = useState<LabVisibility[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    void api
      .get<{ labs: LabVisibility[] }>("/api/labs")
      .then((payload) => setLabs(payload.labs))
      .catch((caught) => {
        setLabs([]);
        setError(describeApiError(caught));
      });
  }, []);

  useEffect(() => {
    if (status === "authenticated" && role === "admin") reload();
  }, [status, role, reload]);

  const toggleVisibility = useCallback(
    async (lab: LabVisibility) => {
      setError(null);
      setBusy(true);
      try {
        await api.put(`/api/admin/labs/${lab.id}/visibility`, { hidden: !lab.hidden });
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
      <AppPageLayout className="admin-page">
        <main className="not-found" role="status">
          <p className="eyebrow">管理 / 无权访问</p>
          <h1>只有管理员可以打开实验管理</h1>
        </main>
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout className="admin-page">
      <main className="page-content profile-main" aria-labelledby="labs-page-title">
        <section className="profile-intro">
          <p className="eyebrow">管理 / ADMIN</p>
          <h1 id="labs-page-title">实验管理</h1>
          <p>管理实验对学生和教师的开放状态。</p>
        </section>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="admin-grid admin-grid-single">
          <section className="profile-card" aria-labelledby="labs-title">
            <div className="profile-card-heading">
              <p className="eyebrow">LABS</p>
              <h2 id="labs-title">实验开放状态</h2>
            </div>
            <p className="admin-labs-hint">
              隐藏的实验对学生和教师不可见；管理员仍可查看实验并重新开放。
            </p>
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">实验</th>
                  <th scope="col">关卡数</th>
                  <th scope="col">状态</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {labs?.map((lab) => (
                  <tr key={lab.id}>
                    <td>
                      {LAB_TITLES[lab.id] ?? lab.id}
                      <span className="admin-lab-id">{lab.id}</span>
                    </td>
                    <td>{lab.stageCount}</td>
                    <td>
                      <span className={`admin-lab-state${lab.hidden ? " is-hidden" : ""}`}>
                        {lab.hidden ? "已隐藏" : "开放中"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="button button-ghost admin-inline-button"
                        disabled={busy}
                        onClick={() => void toggleVisibility(lab)}
                        title={lab.hidden ? "重新对学生和教师开放" : "对学生和教师隐藏"}
                        type="button"
                      >
                        {lab.hidden ? "恢复开放" : "隐藏"}
                      </button>
                    </td>
                  </tr>
                ))}
                {labs === null ? (
                  <tr>
                    <td colSpan={4}>正在加载实验…</td>
                  </tr>
                ) : labs.length === 0 ? (
                  <tr>
                    <td colSpan={4}>还没有实验。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </div>
      </main>
    </AppPageLayout>
  );
}
