import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "../../shared/api/client";
import { isStaffRole, useAuth } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { Icon } from "../../shared/ui/Icon";
import { coreStages } from "../../features/calculator";
import "./home.css";

type ProjectSummary = { currentStage: number };

type StudentTask = {
  id: string;
  title: string;
  dueAt: string | null;
  status: "not_started" | "in_progress" | "submitted" | "reviewed" | "returned";
  finalScore: number | null;
  finalTotal: number | null;
};

const TASK_STATUS: Record<StudentTask["status"], string> = {
  not_started: "未开始",
  in_progress: "进行中",
  submitted: "已提交",
  reviewed: "已批改",
  returned: "待重做",
};

function StudentTasks({ classId }: { classId: string }) {
  const [tasks, setTasks] = useState<StudentTask[] | null>(null);

  useEffect(() => {
    void api
      .get<{ assignments: StudentTask[] }>(`/api/classes/${classId}/task-assignments`)
      .then((p) => setTasks(p.assignments))
      .catch(() => setTasks([]));
  }, [classId]);

  if (!tasks || tasks.length === 0) return null;
  const open = tasks.filter((t) => t.status !== "reviewed");
  return (
    <section aria-labelledby="tasks-title" className="current-lab-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">任务单</p>
          <h2 id="tasks-title">布置的任务{open.length > 0 ? `（${open.length} 项待完成）` : ""}</h2>
        </div>
      </div>
      <div className="lab-card-grid">
        {tasks.map((task) => (
          <article className="lab-card" key={task.id}>
            <div className="lab-card-topline">
              <span className={`ts-task-badge ${task.status}`}>{TASK_STATUS[task.status]}</span>
            </div>
            <h4>{task.title}</h4>
            <p>
              {task.dueAt
                ? `截止 ${new Date(task.dueAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                : "无截止时间"}
              {task.status === "reviewed" && task.finalScore !== null
                ? ` · ${task.finalScore}/${task.finalTotal} 分`
                : ""}
            </p>
            <Link
              className="button button-primary"
              params={{ assignmentId: task.id, classId }}
              to="/classes/$classId/tasks/$assignmentId"
            >
              {task.status === "reviewed"
                ? "查看批改"
                : task.status === "submitted"
                  ? "查看提交"
                  : task.status === "in_progress"
                    ? "继续作答"
                    : task.status === "returned"
                      ? "重新作答"
                      : "开始作答"}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function AnonymousLanding() {
  return (
    <AppPageLayout className="home-page" topbarProps={{ showAccount: false }}>
      <main className="page-content">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-copy">
            <p className="eyebrow">校内信息技术实验</p>
            <h1 id="home-title">计算实验室</h1>
            <p className="home-lede">
              用逻辑门亲手搭出一个能做加减乘的计算器。每一关都由服务器判定，通过后解锁下一关。
            </p>
            <div className="home-hero-actions">
              <Link className="button button-primary" to="/login">
                登录 <Icon name="arrow-right" size={14} />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </AppPageLayout>
  );
}

function StageProgress({ currentStage }: { currentStage: number }) {
  const total = coreStages().length;
  const done = Math.max(0, Math.min(currentStage - 1, total));
  return (
    <div className="progress-block">
      <div
        aria-label={`已完成 ${done} / ${total} 关`}
        aria-valuemax={total}
        aria-valuemin={0}
        aria-valuenow={done}
        className="progress-track"
        role="progressbar"
      >
        <span className="progress-fill" style={{ width: `${(done / total) * 100}%` }} />
      </div>
      <p className="progress-caption">
        已通过 {done} / {total} 关
      </p>
    </div>
  );
}

function ClassroomHome() {
  const { primaryMembership, role } = useAuth();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const classId = primaryMembership?.classId;
  const isStaff = isStaffRole(role);

  useEffect(() => {
    if (!classId || isStaff) return;
    void api
      .get<ProjectSummary>(`/api/classes/${classId}/labs/calculator/project`)
      .then(setProject)
      .catch(() => setProject(null));
  }, [classId, isStaff]);

  return (
    <AppPageLayout className="home-page">
      <main className="page-content">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-copy">
            <p className="eyebrow">{primaryMembership?.className ?? "未加入班级"}</p>
            <h1 id="home-title">
              {role === "admin" ? "管理工作台" : role === "teacher" ? "教师工作台" : "我的实验"}
            </h1>
          </div>
        </section>

        <section className="current-lab-section" aria-labelledby="current-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">正在进行</p>
              <h2 id="current-title">当前实验</h2>
            </div>
          </div>

          <div className="lab-card-grid">
            <article className="lab-card is-primary">
              <div className="lab-card-topline">
                <span className="category-label">Lab 01</span>
              </div>
              <h4>实现ALU</h4>
              <p>从半加器到完整计算器：用逻辑门逐关搭出运算电路。</p>
              {!isStaff && project ? <StageProgress currentStage={project.currentStage} /> : null}
              {classId ? (
                <Link className="button button-primary" to="/labs/calculator">
                  {project && project.currentStage > 1 ? "继续" : "开始"}
                </Link>
              ) : null}
            </article>
          </div>
        </section>

        {classId && !isStaff ? <StudentTasks classId={classId} /> : null}
      </main>
    </AppPageLayout>
  );
}

export function HomePage() {
  const { status } = useAuth();
  if (status === "loading") {
    return (
      <AppPageLayout className="home-page">
        <main className="page-content">
          <p className="home-loading" role="status">
            正在载入…
          </p>
        </main>
      </AppPageLayout>
    );
  }
  return status === "authenticated" ? <ClassroomHome /> : <AnonymousLanding />;
}
