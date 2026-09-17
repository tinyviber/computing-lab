import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { ImageEncodingPage } from "../../features/image-encoding";
import { useAuth } from "../../shared/auth";
import "./home.css";

/**
 * The catalog lists a static `/labs/image-encoding` route, but class members
 * get the class-scoped route so drafts and checks persist. Anonymous visitors
 * keep the standalone lab here — the deployment must work without an API.
 */
export function ImageEncodingRedirectPage() {
  const { status, primaryMembership } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const classId = primaryMembership?.classId;

  useEffect(() => {
    if (status === "authenticated" && classId) {
      void navigate({
        to: "/classes/$classId/labs/image-encoding",
        params: { classId },
        search,
      });
    }
  }, [status, classId, navigate, search]);

  if (status === "authenticated" && !classId) {
    return (
      <div className="not-found" role="status">
        <p className="eyebrow">实验 / 未加入班级</p>
        <h1>你还没有加入班级</h1>
        <p>请联系管理员把你的账号分配到班级后再开始实验。</p>
        <div className="error-actions">
          <Link className="button button-primary" to="/">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  if (status === "anonymous") {
    return <ImageEncodingPage />;
  }

  return (
    <p className="home-loading" role="status">
      正在进入实验…
    </p>
  );
}
