import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import "./home.css";

/** Public entry for the cpu lab; sends students into their class context. */
export function CpuRedirectPage() {
  const { status, primaryMembership } = useAuth();
  const navigate = useNavigate();
  const classId = primaryMembership?.classId;

  useEffect(() => {
    if (status === "anonymous") {
      void navigate({ to: "/login" });
      return;
    }
    if (classId) {
      void navigate({ to: "/classes/$classId/labs/cpu", params: { classId } });
    }
  }, [status, classId, navigate]);

  if (status === "authenticated" && !classId) {
    return (
      <AppPageLayout>
        <main className="not-found" role="status">
          <p className="eyebrow">实验 / 未加入班级</p>
          <h1>你还没有加入班级</h1>
          <p>请联系管理员把你的账号分配到班级后再开始实验。</p>
        </main>
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout>
      <p className="home-loading" role="status">
        正在进入实验…
      </p>
    </AppPageLayout>
  );
}
