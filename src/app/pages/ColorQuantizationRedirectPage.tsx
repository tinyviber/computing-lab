import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "../../shared/auth";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import "./home.css";

/** Public entry for the color-quantization lab; teachers see a preview notice. */
export function ColorQuantizationRedirectPage() {
  const { status, primaryMembership, role } = useAuth();
  const navigate = useNavigate();
  const classId = primaryMembership?.classId;

  useEffect(() => {
    if (status === "anonymous") {
      void navigate({ to: "/login" });
      return;
    }
    if (classId && role !== "teacher") {
      void navigate({ to: "/classes/$classId/labs/color-quantization", params: { classId } });
    }
  }, [status, classId, role, navigate]);

  if (status === "authenticated" && role === "teacher") {
    return (
      <AppPageLayout>
        <main className="not-found" role="status">
          <p className="eyebrow">实验 / 预览阶段</p>
          <h1>这个实验暂未开放</h1>
          <p>「颜色量化」实验目前仅对管理员开放预览。</p>
        </main>
      </AppPageLayout>
    );
  }

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
