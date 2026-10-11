import { Navigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { useAuth } from "../../shared/auth";
import { useLabCatalog } from "../../shared/lab/labs";
import { AppPageLayout } from "../../shared/layout/AppTopbar";

const AudioEncodingDemoPage = lazy(() =>
  import("../../features/audio-encoding").then((module) => ({
    default: module.AudioEncodingDemoPage,
  })),
);

function LoadingPage() {
  return (
    <AppPageLayout>
      <p className="home-loading" role="status">
        正在载入…
      </p>
    </AppPageLayout>
  );
}

/** The browser-only demo still follows the same admin and class visibility controls. */
export function AudioEncodingEntryPage() {
  const { status, role } = useAuth();
  const catalog = useLabCatalog(status === "authenticated");
  const allowed = role === "admin" || catalog?.get("audio-encoding")?.visible === true;

  if (status === "loading" || (status === "authenticated" && role !== "admin" && !catalog)) {
    return <LoadingPage />;
  }
  if (status === "anonymous") return <Navigate replace to="/login" />;
  if (!allowed) {
    return (
      <AppPageLayout>
        <main className="not-found" role="status">
          <p className="eyebrow">实验 / 暂未开放</p>
          <h1>这个实验暂未开放</h1>
          <p>「声音编码（演示）」暂未对你所在的班级开放，开放后再来。</p>
        </main>
      </AppPageLayout>
    );
  }

  return (
    <Suspense fallback={<LoadingPage />}>
      <AudioEncodingDemoPage />
    </Suspense>
  );
}
