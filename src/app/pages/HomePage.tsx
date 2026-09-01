import { Link } from "@tanstack/react-router";
import { labs } from "../catalog/labs";
import "./home.css";

const catalogGroups = [
  { label: "信息编码", ids: ["image-encoding", "audio-encoding", "utf8", "byte-edit"] },
  { label: "系统与程序", ids: ["home-network", "program-execution", "protocol-process"] },
  { label: "数据与模拟", ids: ["twos-complement", "relational-data", "monte-carlo"] },
];

export function HomePage() {
  return (
    <div className="home-page">
      <header className="home-topbar">
        <Link className="home-brand" to="/" aria-label="计算实验室首页">
          <span className="home-brand-mark">⌁</span>
          <span>计算实验室</span>
        </Link>
        <nav aria-label="主导航" className="home-nav">
          <a className="is-active" href="#catalog">
            实验目录
          </a>
          <Link to="/editor">课件编辑</Link>
        </nav>
      </header>

      <main>
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-copy">
            <p className="eyebrow">计算实验 / 01</p>
            <h1 id="home-title">交互式计算实验</h1>
            <div className="home-hero-actions">
              <a className="button button-primary" href="#catalog">
                选择一个实验 <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
          <div className="home-overview" aria-label="实验目录概览">
            <p className="eyebrow">实验目录</p>
            <div className="home-overview-groups">
              {catalogGroups.map((group) => (
                <div className="home-overview-group" key={group.label}>
                  <span>{group.label}</span>
                  <strong>{group.ids.length} 个实验</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="catalog-section" aria-labelledby="catalog-title" id="catalog">
          <div className="section-heading catalog-heading">
            <div>
              <p className="eyebrow">实验目录</p>
              <h2 id="catalog-title">按主题进入实验室</h2>
            </div>
            <span className="summary-note">{labs.length} 个实验</span>
          </div>
          <div className="catalog-groups">
            {catalogGroups.map((group) => (
              <section
                className="catalog-group"
                key={group.label}
                aria-labelledby={`group-${group.label}`}
              >
                <h3 id={`group-${group.label}`}>{group.label}</h3>
                <div className="lab-card-grid">
                  {group.ids.map((id) => {
                    const lab = labs.find((item) => item.id === id);
                    if (!lab) return null;
                    return (
                      <Link className="lab-card" key={lab.id} to={lab.route}>
                        <div className="lab-card-topline">
                          <span className="category-label">
                            {lab.status === "available" ? "可用" : "预览"}
                          </span>
                          <span className="card-arrow" aria-hidden="true">
                            ↗
                          </span>
                        </div>
                        <h4>{lab.title}</h4>
                        <p>{lab.description}</p>
                        <span className="lab-card-action">进入实验</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
