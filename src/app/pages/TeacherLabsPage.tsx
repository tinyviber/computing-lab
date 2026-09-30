import { Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, describeApiError } from "../../shared/api/client";
import { isStaffRole, useAuth } from "../../shared/auth";
import { LAB_TITLES, type TeacherLabView } from "../../shared/lab/labs";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import "./admin.css";

type TeacherLabPayload = {
  classes: { id: string; name: string }[];
  labs: TeacherLabView[];
};

/** Busy flag per (lab, class) checkbox while a toggle is in flight. */
function gateKey(labId: string, classId: string) {
  return `${labId}:${classId}`;
}

export function TeacherLabsPage() {
  const { status, role } = useAuth();
  const isStaff = isStaffRole(role);
  const [data, setData] = useState<TeacherLabPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(() => new Set());

  const reload = useCallback(() => {
    void api
      .get<TeacherLabPayload>("/api/teacher/labs")
      .then(setData)
      .catch((caught) => {
        setData(null);
        setError(describeApiError(caught));
      });
  }, []);

  useEffect(() => {
    if (status === "authenticated" && isStaff) reload();
  }, [status, isStaff, reload]);

  const toggle = useCallback(async (lab: TeacherLabView, classId: string, open: boolean) => {
    const key = gateKey(lab.id, classId);
    setError(null);
    setBusy((current) => new Set(current).add(key));
    try {
      await api.put(`/api/teacher/labs/${lab.id}/classes/${classId}/open`, { open });
      setData((current) =>
        current
          ? {
              ...current,
              labs: current.labs.map((row) =>
                row.id !== lab.id
                  ? row
                  : {
                      ...row,
                      classes: row.classes.map((gate) =>
                        gate.classId !== classId
                          ? gate
                          : { ...gate, teacherOpen: open, open: open && gate.adminAllowed },
                      ),
                    },
              ),
            }
          : current,
      );
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }, []);

  if (status === "loading") {
    return (
      <p className="home-loading" role="status">
        正在载入…
      </p>
    );
  }
  if (status === "anonymous") return <Navigate replace to="/login" />;
  if (!isStaff) {
    return (
      <AppPageLayout className="admin-page">
        <main className="not-found" role="status">
          <p className="eyebrow">管理 / 无权访问</p>
          <h1>只有教师可以打开实验管理</h1>
        </main>
      </AppPageLayout>
    );
  }

  const classNames = new Map((data?.classes ?? []).map((klass) => [klass.id, klass.name]));

  return (
    <AppPageLayout className="admin-page">
      <main className="page-content profile-main" aria-labelledby="labs-page-title">
        <section className="profile-intro">
          <p className="eyebrow">管理 / 实验</p>
          <h1 id="labs-page-title">实验管理</h1>
          <p>选择每个实验是否对你任课的班级开放。</p>
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
              <h2 id="labs-title">班级开放开关</h2>
            </div>
            <p className="admin-labs-hint">
              隐藏和班级范围由管理员决定；你只能关掉或放开自己任课的班级，学生立即受影响。
            </p>
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">实验</th>
                  <th scope="col">关卡数</th>
                  <th scope="col">状态</th>
                  <th scope="col">我的班级</th>
                </tr>
              </thead>
              <tbody>
                {data?.labs.map((lab) => {
                  const openCount = lab.classes.filter((gate) => gate.open).length;
                  return (
                    <tr key={lab.id}>
                      <td>
                        {LAB_TITLES[lab.id] ?? lab.id}
                        <span className="admin-lab-id">{lab.id}</span>
                      </td>
                      <td>{lab.stageCount}</td>
                      <td>
                        <span className="admin-lab-state">{openCount} 个班开放</span>
                      </td>
                      <td className="admin-lab-config">
                        <div className="admin-lab-classes">
                          {lab.classes.map((gate) => (
                            <label
                              className="admin-lab-class"
                              key={gate.classId}
                              title={
                                gate.adminAllowed
                                  ? undefined
                                  : "管理员未勾选这个班，勾选即对本班学生开放"
                              }
                            >
                              <input
                                checked={gate.teacherOpen}
                                disabled={busy.has(gateKey(lab.id, gate.classId))}
                                onChange={() => void toggle(lab, gate.classId, !gate.teacherOpen)}
                                type="checkbox"
                              />
                              {classNames.get(gate.classId) ?? gate.classId}
                            </label>
                          ))}
                          {lab.classes.length === 0 ? (
                            <span className="admin-lab-class-empty">
                              你还没有任课的班级，请管理员把你加入班级。
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {data === null ? (
                  <tr>
                    <td colSpan={4}>正在加载实验…</td>
                  </tr>
                ) : data.labs.length === 0 ? (
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
