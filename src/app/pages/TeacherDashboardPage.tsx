import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, describeApiError } from "../../shared/api/client";
import { isStaffRole, useAuth } from "../../shared/auth";
import { CALCULATOR_STAGES } from "../../features/calculator";
import { IMAGE_SAMPLING_STAGES } from "../../features/image-sampling/domain/stages";
import { COLOR_QUANT_STAGES } from "../../features/color-quantization/domain/stages";
import { TaskDashboard, type AssignmentSummary } from "../../features/task-sheets/ui/TaskDashboard";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { Icon } from "../../shared/ui/Icon";
import "./dashboard.css";
import "../../features/task-sheets/ui/taskSheets.css";

/** First-level dashboard category: lab matrix vs task-sheet responses. */
type DashKind = "lab" | "task";

type LabOption = {
  id: string;
  title: string;
  stages: { index: number; englishTitle: string; title: string }[];
  teacherVisible: boolean;
};

const LAB_OPTIONS: LabOption[] = [
  { id: "calculator", title: "实现ALU", stages: CALCULATOR_STAGES, teacherVisible: true },
  {
    id: "image-sampling",
    title: "图像的空间采样",
    stages: IMAGE_SAMPLING_STAGES,
    teacherVisible: false,
  },
  {
    id: "color-quantization",
    title: "颜色量化与墨粉",
    stages: COLOR_QUANT_STAGES,
    teacherVisible: false,
  },
];

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
  if (cell.passed)
    return (
      <span className="cell-pass">
        <Icon name="check" size={14} />
      </span>
    );
  return (
    <button className="cell-score" onClick={onOpen} type="button">
      {cell.score}/{cell.total}
    </button>
  );
}

export function TeacherDashboardPage() {
  const { classId } = useParams({ strict: false }) as { classId?: string };
  const search = useSearch({ strict: false }) as {
    kind?: string;
    lab?: string;
    assignment?: string;
  };
  const navigate = useNavigate();
  const { status, role, session } = useAuth();
  const [payload, setPayload] = useState<MatrixPayload | null>(null);
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const isAdmin = role === "admin";

  const kind: DashKind = search.kind === "task" ? "task" : "lab";
  const labOptions = LAB_OPTIONS.filter((l) => l.teacherVisible || isAdmin);
  const lab = labOptions.find((l) => l.id === search.lab) ?? labOptions[0] ?? LAB_OPTIONS[0];
  const assignment = assignments.find((a) => a.id === search.assignment) ?? assignments[0] ?? null;

  const load = useCallback(() => {
    if (!classId) return;
    void api
      .get<MatrixPayload>(`/api/classes/${classId}/dashboard?lab=${lab.id}`)
      .then(setPayload)
      .catch((caught) => setError(describeApiError(caught)));
  }, [classId, lab.id]);

  const loadAssignments = useCallback(() => {
    if (!classId) return;
    void api
      .get<{ assignments: AssignmentSummary[] }>(`/api/classes/${classId}/task-assignments`)
      .then((p) => setAssignments(p.assignments))
      .catch((caught) => setError(describeApiError(caught)));
  }, [classId]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (kind === "task") loadAssignments();
    else load();
  }, [status, kind, load, loadAssignments]);

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

  const selectClass = (nextClassId: string) => {
    void navigate({
      params: { classId: nextClassId },
      search,
      to: "/classes/$classId/dashboard",
    });
  };

  const selectKind = (next: DashKind) => {
    void navigate({
      params: { classId: classId ?? "" },
      search: next === "task" ? { kind: "task" } : { kind: "lab", lab: lab.id },
      to: "/classes/$classId/dashboard",
    });
  };

  const selectLab = (labId: string) => {
    void navigate({
      params: { classId: classId ?? "" },
      search: { kind: "lab", lab: labId },
      to: "/classes/$classId/dashboard",
    });
  };

  const selectAssignment = (nextAssignmentId: string) => {
    void navigate({
      params: { classId: classId ?? "" },
      search: { kind: "task", assignment: nextAssignmentId },
      to: "/classes/$classId/dashboard",
    });
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
    <AppPageLayout className="dashboard-page">
      <main aria-label="学生进度矩阵" className="page-content">
        <div className="dashboard-heading">
          <div className="dashboard-heading-copy">
            <p className="eyebrow">班级看板</p>
            <h1>{kind === "task" ? "任务单提交" : "学生进度"}</h1>
            <p>
              {kind === "task"
                ? "查看每次任务单布置的提交与批改。"
                : "按关卡查看当前班级每位学生的最新提交结果。"}
            </p>
          </div>
          <div className="dashboard-controls">
            {(session?.memberships.length ?? 0) > 0 ? (
              <label className="field-select" htmlFor="dashboard-class-select">
                <span>班级</span>
                <select
                  aria-label="选择班级"
                  id="dashboard-class-select"
                  onChange={(event) => selectClass(event.target.value)}
                  value={classId ?? ""}
                >
                  {session?.memberships.map((membership) => (
                    <option key={membership.classId} value={membership.classId}>
                      {membership.className}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="field-select" htmlFor="dashboard-kind-select">
              <span>分类</span>
              <select
                aria-label="看板分类"
                id="dashboard-kind-select"
                onChange={(event) => selectKind(event.target.value as DashKind)}
                value={kind}
              >
                <option value="lab">实验</option>
                <option value="task">任务单</option>
              </select>
            </label>
            {kind === "lab" ? (
              <label className="field-select" htmlFor="dashboard-lab-select">
                <span>实验</span>
                <select
                  aria-label="选择实验"
                  id="dashboard-lab-select"
                  onChange={(event) => selectLab(event.target.value)}
                  value={lab.id}
                >
                  {labOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="field-select" htmlFor="dashboard-assignment-select">
                <span>任务单</span>
                <select
                  aria-label="选择任务单"
                  disabled={assignments.length === 0}
                  id="dashboard-assignment-select"
                  onChange={(event) => selectAssignment(event.target.value)}
                  value={assignment?.id ?? ""}
                >
                  {assignments.length === 0 ? <option value="">尚未布置</option> : null}
                  {assignments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                      {a.archived ? "（已归档）" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
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

        {kind === "task" && classId ? (
          <TaskDashboard
            assignment={assignment}
            classId={classId}
            onAssignmentsChanged={loadAssignments}
          />
        ) : (
          <div aria-label="学生进度横向滚动区" className="matrix-scroll" tabIndex={0}>
            <table className="matrix-table">
              <caption className="sr-only">按关卡显示每位学生的最新提交结果</caption>
              <thead>
                <tr>
                  <th scope="col">学号</th>
                  <th scope="col">姓名</th>
                  {lab.stages.map((stage) => (
                    <th key={stage.index} scope="col" title={stage.title}>
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
                    {lab.stages.map((stage) => (
                      <td key={stage.index}>
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
                    <td colSpan={lab.stages.length + (isAdmin ? 4 : 3)}>
                      还没有学生加入这个班级。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
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
                <Icon name="x" size={16} />
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
                    <span className="drawer-category-score">
                      {bucket.passed}/{bucket.total} <Icon name={ok ? "check" : "x"} size={13} />
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="drawer-note">提交时间 {timeOf(detail.submittedAt)}</p>
          </aside>
        </div>
      ) : null}
    </AppPageLayout>
  );
}
