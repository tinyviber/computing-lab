import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "../../shared/auth";
import "./home.css";

/**
 * The catalog lists a static `/labs/calculator` route, but the lab itself is
 * class-scoped. This forwards a signed-in member to their own class.
 */
export function CalculatorRedirectPage() {
  const { status, primaryMembership } = useAuth();
  const navigate = useNavigate();
  const classId = primaryMembership?.classId;

  useEffect(() => {
    if (status === "anonymous") {
      void navigate({ to: "/login" });
      return;
    }
    if (classId) {
      void navigate({ to: "/classes/$classId/labs/calculator", params: { classId } });
    }
  }, [status, classId, navigate]);

  if (status === "authenticated" && !classId) {
    return (
      <div className="not-found" role="status">
        <p className="eyebrow">实验 / 未加入班级</p>
        <h1>你还没有加入班级</h1>
        <p>请用老师给的邀请码加入班级后再开始实验。</p>
        <div className="error-actions">
          <Link className="button button-primary" to="/login">
            用邀请码加入
          </Link>
        </div>
      </div>
    );
  }

  return (
    <p className="home-loading" role="status">
      正在进入实验…
    </p>
  );
}
