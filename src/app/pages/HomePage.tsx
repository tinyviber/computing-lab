import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "../../shared/api/client";
import { isStaffRole, useAuth } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
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

  useEffect(() => {
    if (!classId || isStaff) return;
    void api
      .get<ProjectSummary>(`/api/classes/${classId}/labs/calculator/project`)
      .then(setProject)
      .catch(() => setProject(null));
  }, [classId, isStaff]);

  return (
    <AppPageLayout className="home-page">
      <main>
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
                  <span className="category-label">Lab 02 · 预览</span>
                </div>
                <h4>图像的空间采样</h4>
                <p>二值剪影 + 分辨率收缩：找到仍能区分整组图片的最小格子数。</p>
                {classId ? (
                  <Link className="button button-secondary" to="/labs/image-sampling">
                    打开预览
                  </Link>
                ) : null}
              </article>
            ) : null}

            {role === "admin" ? (
              <article className="lab-card">
                <div className="lab-card-topline">
                  <span className="category-label">Lab 03 · 预览</span>
                </div>
                <h4>颜色量化与墨粉</h4>
                <p>
                  打印机只有几种粉：选装哪些墨粉、或改写映射规则，让整组机器人印出来仍然分得开。
                </p>
                {classId ? (
                  <Link className="button button-secondary" to="/labs/color-quantization">
                    打开预览
                  </Link>
                ) : null}
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
