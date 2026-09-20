import { Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, describeApiError } from "../../shared/api/client";
import { AccountMenu, isStaffRole, useAuth } from "../../shared/auth";
import { CALCULATOR_STAGES } from "../../features/calculator";
import "./dashboard.css";

type MatrixCell = {
  stageIndex: number;
  score: number;
  total: number;
  passed: boolean;
  submissionId: string;
  submittedAt: string;
};

type MatrixRow = {
  userId: string;
  studentNo: string;
  name: string;
  currentStage: number;
  cells: Record<string, MatrixCell>;
  lastActiveAt: string | null;
};

type MatrixPayload = { classId: string; className: string; rows: MatrixRow[] };

type SubmissionDetail = {
  id: string;
  studentNo: string;
  name: string;
  stageIndex: number;
  score: number;
  total: number;
  passed: boolean;
  submittedAt: string;
  testSummary: {
    categories: Record<string, { passed: number; total: number }>;
    error: string | null;
  };
};

function timeOf(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function CellView({ cell, onOpen }: { cell: MatrixCell | undefined; onOpen: () => void }) {
  if (!cell) return <span className="cell-empty">—</span>;
  if (cell.passed) return <span className="cell-pass">✓</span>;
  return (
    <button className="cell-score" onClick={onOpen} type="button">
      {cell.score}/{cell.total}
    </button>
  );
}

export function TeacherDashboardPage() {
  const { classId } = useParams({ strict: false }) as { classId?: string };
  const { status, role, session } = useAuth();
  const [payload, setPayload] = useState<MatrixPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const isAdmin = role === "admin";

  const load = useCallback(() => {
    if (!classId) return;
    void api
      .get<MatrixPayload>(`/api/classes/${classId}/dashboard`)
      .then(setPayload)
      .catch((caught) => setError(describeApiError(caught)));
  }, [classId]);

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status, load]);

  const clearRecords = (row: MatrixRow) => {
    if (
      !window.confirm(
        `确定清空 ${row.name}（${row.studentNo}）的全部做题记录？该学生的关卡进度会被重置。`,
      )
    ) {
      return;
    }
    setNotice(null);
    void api
      .del<{ cleared: { submissions: number; projects: number } }>(
        `/api/admin/users/${row.userId}/records`,
      )
      .then((result) => {
        setNotice(`已清空 ${row.name} 的做题记录（${result.cleared.submissions} 条提交）。`);
        load();
      })
      .catch((caught) => setError(describeApiError(caught)));
  };

  const openDetail = (submissionId: string) => {
    void api
      .get<SubmissionDetail>(`/api/classes/${classId}/dashboard/submissions/${submissionId}`)
      .then(setDetail)
      .catch((caught) => setError(describeApiError(caught)));
  };

  if (status === "loading") {
    return (
      <p className="home-loading" role="status">
        正在载入…
      </p>
    );
  }
  if (status === "anonymous" || (role && !isStaffRole(role))) {
    return (
      <div className="not-found" role="status">
        <p className="eyebrow">看板 / 无权访问</p>
        <h1>只有教师或管理员可以查看班级看板</h1>
        <div className="error-actions">
          <Link className="button button-primary" to="/">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-topbar">
        <div>
          <h1>学生进度</h1>
        </div>
        <div className="dashboard-actions">
          {session?.memberships && session.memberships.length > 1 ? (
            <nav aria-label="班级切换" className="dashboard-class-switcher">
              {session.memberships.map((membership) => (
                <Link
                  className={`dashboard-class-link${membership.classId === classId ? " is-active" : ""}`}
                  key={membership.classId}
                  params={{ classId: membership.classId }}
                  to="/classes/$classId/dashboard"
                >
                  {membership.className}
                </Link>
              ))}
            </nav>
          ) : null}
          <Link className="button button-secondary" to="/">
            返回首页
          </Link>
          <AccountMenu />
        </div>
      </header>

      <main aria-label="学生进度矩阵">
        {error ? (
          <p className="test-error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="dashboard-note" role="status">
            {notice}
          </p>
        ) : null}

        <table className="matrix-table">
          <caption className="sr-only">按关卡显示每位学生的最新提交结果</caption>
          <thead>
            <tr>
              <th scope="col">学号</th>
              <th scope="col">姓名</th>
              {CALCULATOR_STAGES.map((stage) => (
                <th key={stage.id} scope="col" title={stage.title}>
                  {stage.englishTitle}
                </th>
              ))}
              <th scope="col">最后活动</th>
              {isAdmin ? <th scope="col">操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {(payload?.rows ?? []).map((row) => (
              <tr key={row.studentNo}>
                <th scope="row">{row.studentNo}</th>
                <td>{row.name}</td>
                {CALCULATOR_STAGES.map((stage) => (
                  <td key={stage.id}>
                    <CellView
                      cell={row.cells[String(stage.index)]}
                      onOpen={() => {
                        const cell = row.cells[String(stage.index)];
                        if (cell) openDetail(cell.submissionId);
                      }}
                    />
                  </td>
                ))}
                <td>{timeOf(row.lastActiveAt)}</td>
                {isAdmin ? (
                  <td>
                    <button
                      className="cell-score"
                      onClick={() => clearRecords(row)}
                      title="删除该学生的全部提交和关卡进度"
                      type="button"
                    >
                      清空记录
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
            {payload && payload.rows.length === 0 ? (
              <tr>
                <td colSpan={CALCULATOR_STAGES.length + (isAdmin ? 4 : 3)}>
                  还没有学生加入这个班级。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </main>

      {detail ? (
        <div className="drawer-scrim" role="presentation" onClick={() => setDetail(null)}>
          <aside
            aria-label="提交详情"
            className="drawer"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header>
              <p className="eyebrow">
                {detail.studentNo} {detail.name}
              </p>
              <h2>
                第 {detail.stageIndex} 关 · {detail.score} / {detail.total}
              </h2>
              <button
                aria-label="关闭详情"
                className="drawer-close"
                onClick={() => setDetail(null)}
                type="button"
              >
                ×
              </button>
            </header>

            {detail.testSummary.error ? (
              <p className="test-error">{detail.testSummary.error}</p>
            ) : null}

            <ul className="drawer-categories">
              {Object.entries(detail.testSummary.categories).map(([category, bucket]) => {
                const ok = bucket.passed === bucket.total;
                return (
                  <li className={ok ? "is-pass" : "is-fail"} key={category}>
                    <span>{category}</span>
                    <span>
                      {bucket.passed}/{bucket.total} {ok ? "✓" : "×"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="drawer-note">提交时间 {timeOf(detail.submittedAt)}</p>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
