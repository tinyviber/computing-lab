import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "../../shared/auth";
import { useLabCatalog } from "../../shared/lab/labs";
import { AppPageLayout } from "../../shared/layout/AppTopbar";
import "./home.css";

/** The public calculator entry forwards a signed-in member to their own class. */
export function CalculatorRedirectPage() {
  const { status, primaryMembership, role } = useAuth();
  const catalog = useLabCatalog(status === "authenticated");
  const navigate = useNavigate();
  const classId = primaryMembership?.classId;
  const hidden = catalog?.get("calculator")?.hidden === true;

  useEffect(() => {
    if (status === "anonymous") {
      void navigate({ to: "/login" });
      return;
    }
    // Non-admins wait for the catalog so a hidden lab never flashes through.
    if (classId && (role === "admin" || (catalog !== null && !hidden))) {
      void navigate({ to: "/classes/$classId/labs/calculator", params: { classId } });
    }
  }, [status, classId, role, catalog, hidden, navigate]);

  if (status === "authenticated" && hidden && role !== "admin") {
    return (
      <AppPageLayout>
        <main className="not-found" role="status">
          <p className="eyebrow">实验 / 已隐藏</p>
          <h1>这个实验暂未开放</h1>
          <p>「实现ALU」已被管理员隐藏，开放后再来。</p>
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
