import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "../../shared/api/client";
import { isAdminRole, isStaffRole, useAuth } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import { enabledLabs, experimentalLabs } from "../catalog/labs";
import { coreStages } from "../../features/calculator";
import "./home.css";

type ProjectSummary = { currentStage: number };

function AnonymousLanding() {
  return (
    <AppPageLayout className="home-page" topbarProps={{ showAccount: false }}>
      <main>
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-copy">
            <p className="eyebrow">校内信息技术实验</p>
            <h1 id="home-title">计算实验室</h1>
            <p className="home-lede">
              用逻辑门亲手搭出一个能做加减乘的计算器。每一关都由服务器判定，通过后解锁下一关。
            </p>
            <div className="home-hero-actions">
              <Link className="button button-primary" to="/login">
                登录 <span aria-hidden="true">→</span>
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
  const isAdmin = isAdminRole(role);

  useEffect(() => {
    if (!classId || isStaff) return;
    void api
      .get<ProjectSummary>(`/api/classes/${classId}/labs/calculator/project`)
      .then(setProject)
      .catch(() => setProject(null));
  }, [classId, isStaff]);

  const experimental = experimentalLabs();

  return (
    <AppPageLayout
      className="home-page"
      topbarProps={{
        nav: isAdmin ? (
          <nav aria-label="主导航" className="home-nav">
            <Link to="/editor">课件编辑</Link>
          </nav>
        ) : undefined,
      }}
    >
      <main>
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-copy">
            <p className="eyebrow">{primaryMembership?.className ?? "未加入班级"}</p>
            <h1 id="home-title">
              {role === "admin" ? "管理工作台" : role === "teacher" ? "教师工作台" : "我的实验"}
            </h1>
          </div>
        </section>

        <section className="catalog-section" aria-labelledby="current-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">正在进行</p>
              <h2 id="current-title">当前实验</h2>
            </div>
          </div>

          <div className="lab-card-grid">
            {enabledLabs().map((lab) => (
              <article className="lab-card is-primary" key={lab.id}>
                <div className="lab-card-topline">
                  <span className="category-label">Lab 01</span>
                </div>
                <h4>{lab.title}</h4>
                <p>{lab.description}</p>
                {!isStaff && project && lab.id === "calculator" ? (
                  <StageProgress currentStage={project.currentStage} />
                ) : null}
                {classId ? (
                  <Link className="button button-primary" to={lab.route}>
                    {lab.id === "calculator" && project && project.currentStage > 1
                      ? "继续"
                      : "开始"}
                  </Link>
                ) : null}
              </article>
            ))}

            {isStaff && classId ? (
              <article className="lab-card">
                <div className="lab-card-topline">
                  <span className="category-label">教师</span>
                </div>
                <h4>班级看板</h4>
                <p>查看每位学生的关卡进度、得分与失败用例类别。</p>
                <Link
                  className="button button-secondary"
                  params={{ classId }}
                  to="/classes/$classId/dashboard"
                >
                  打开看板
                </Link>
              </article>
            ) : null}

            {role === "admin" ? (
              <article className="lab-card">
                <div className="lab-card-topline">
                  <span className="category-label">管理</span>
                </div>
                <h4>账号与班级管理</h4>
                <p>创建账号、批量导入学生、管理班级与邀请码。</p>
                <Link className="button button-secondary" to="/admin">
                  打开管理页
                </Link>
              </article>
            ) : null}
          </div>
        </section>

        {isAdmin && experimental.length > 0 ? (
          <section className="catalog-section" aria-labelledby="experimental-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">仅管理员可见</p>
                <h2 id="experimental-title">未开放的实验</h2>
              </div>
              <span className="summary-note">{experimental.length} 个</span>
            </div>
            <div className="lab-card-grid">
              {experimental.map((lab) => (
                <Link className="lab-card is-muted" key={lab.id} to={lab.route}>
                  <div className="lab-card-topline">
                    <span className="category-label">未开放</span>
                  </div>
                  <h4>{lab.title}</h4>
                  <p>{lab.description}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </AppPageLayout>
  );
}

export function HomePage() {
  const { status } = useAuth();
  if (status === "loading") {
    return (
      <AppPageLayout className="home-page">
        <main>
          <p className="home-loading" role="status">
            正在载入…
          </p>
        </main>
      </AppPageLayout>
    );
  }
  return status === "authenticated" ? <ClassroomHome /> : <AnonymousLanding />;
}
