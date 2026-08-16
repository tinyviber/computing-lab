import { Link, type ErrorComponentProps } from "@tanstack/react-router";
import "./home.css";

export function LabErrorPage({ error, reset }: ErrorComponentProps) {
  return (
    <div className="not-found" role="alert">
      <p className="eyebrow">LAB / RECOVERABLE ERROR</p>
      <h1>实验暂时无法显示</h1>
      <p>{error instanceof Error ? error.message : "实验遇到未知错误。"}</p>
      <div className="error-actions">
        <button className="button button-secondary" onClick={reset} type="button">
          重试实验
        </button>
        <Link className="button button-primary" to="/">
          返回首页
        </Link>
      </div>
    </div>
  );
}
