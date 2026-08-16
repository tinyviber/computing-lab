import { Link } from "@tanstack/react-router";
import "./home.css";

export function NotFoundPage() {
  return (
    <div className="not-found">
      <p className="eyebrow">404 / ROUTE NOT FOUND</p>
      <h1>实验不存在</h1>
      <p>这个地址没有对应的 Computing Lab 实验。</p>
      <Link className="button button-primary" to="/">
        返回首页
      </Link>
    </div>
  );
}
