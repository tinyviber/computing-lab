import { Link } from "@tanstack/react-router";
import { labs } from "../catalog/labs";
import "./home.css";

export function HomePage() {
  return (
    <div className="home-page">
      <header className="home-header">
        <div>
          <p className="eyebrow">计算实验室 · 本地运行</p>
          <h1>交互式计算实验</h1>
          <p className="home-lede">
            用可观察、可调整的实验理解信息编码与网络配置。无需账号，状态留在浏览器里。
          </p>
        </div>
        <span className="home-mark" aria-hidden="true">
          CL
        </span>
      </header>
      <section aria-labelledby="lab-catalog-title">
        <div className="section-heading catalog-heading">
          <div>
            <p className="eyebrow">实验目录</p>
            <h2 id="lab-catalog-title">选择一个实验</h2>
          </div>
          <span className="summary-note">{labs.length} 个实验 · 本地优先</span>
        </div>
        <div className="lab-card-grid">
          {labs.map((lab) => (
            <Link className="lab-card" key={lab.id} to={lab.route}>
              <div className="lab-card-topline">
                <span className="category-label">{lab.category}</span>
                <span className="card-arrow" aria-hidden="true">
                  ↗
                </span>
              </div>
              <h3>{lab.title}</h3>
              <p>{lab.description}</p>
              <span className="lab-card-action">打开实验</span>
            </Link>
          ))}
        </div>
      </section>
      <footer className="home-footer">
        <span className="local-dot" aria-hidden="true" />
        <span>所有计算都在浏览器本地完成。</span>
      </footer>
    </div>
  );
}
