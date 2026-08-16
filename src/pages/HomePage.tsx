import { Link } from "@tanstack/react-router";
import { labs } from "../app/lab-registry";

export function HomePage() {
  return (
    <div className="home-page">
      <header className="home-header">
        <div>
          <p className="eyebrow">COMPUTING LAB / LOCAL</p>
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
            <p className="eyebrow">LAB REGISTRY</p>
            <h2 id="lab-catalog-title">选择一个实验</h2>
          </div>
          <span className="summary-note">{labs.length} labs / local-first</span>
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
        <span>All calculations run locally in your browser.</span>
      </footer>
    </div>
  );
}
