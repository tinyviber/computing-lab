import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "../../shared/auth";
import { useLabCatalog } from "../../shared/lab/labs";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import "./home.css";

/** Public entry for the image-sampling lab; teachers see a preview notice. */
export function ImageSamplingRedirectPage() {
  const { status, primaryMembership, role } = useAuth();
  const catalog = useLabCatalog(status === "authenticated");
  const navigate = useNavigate();
  const classId = primaryMembership?.classId;
  const hidden = catalog?.get("image-sampling")?.hidden === true;

  useEffect(() => {
    if (status === "anonymous") {
      void navigate({ to: "/login" });
      return;
    }
    // Non-admins wait for the catalog so a hidden lab never flashes through.
    if (classId && role !== "teacher" && (role === "admin" || (catalog !== null && !hidden))) {
      void navigate({ to: "/classes/$classId/labs/image-sampling", params: { classId } });
    }
  }, [status, classId, role, catalog, hidden, navigate]);

  if (status === "authenticated" && hidden && role !== "admin") {
    return (
      <AppPageLayout>
        <main className="not-found" role="status">
          <p className="eyebrow">实验 / 已隐藏</p>
          <h1>这个实验暂未开放</h1>
          <p>「空间采样」已被管理员隐藏，开放后再来。</p>
        </main>
      </AppPageLayout>
    );
  }

  if (status === "authenticated" && role === "teacher") {
    return (
      <AppPageLayout>
        <main className="not-found" role="status">
          <p className="eyebrow">实验 / 预览阶段</p>
          <h1>这个实验暂未开放</h1>
          <p>「空间采样」实验目前仅对管理员开放预览。</p>
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
