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
          <a href="#method">学习方式</a>
        </nav>
        <span className="home-local-status">
          <span className="local-dot" aria-hidden="true" /> 本地学习空间
        </span>
      </header>

      <main>
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-copy">
            <p className="eyebrow">计算实验 / 01</p>
            <h1 id="home-title">交互式计算实验</h1>
            <p className="home-lede">教师提出问题，学生动手改变参数，看结果、记变化、说明原因。</p>
            <div className="home-hero-actions">
              <a className="button button-primary" href="#catalog">
                选择一个实验 <span aria-hidden="true">→</span>
              </a>
              <a className="button button-secondary" href="#method">
                了解课堂使用方式
              </a>
            </div>
          </div>
          <div className="home-overview" aria-label="实验目录概览">
            <p className="eyebrow">课堂目录</p>
            <h2>每个实验都从问题开始</h2>
            <p>目录只按主题分组，不设默认推荐。教师可以从本节课的问题出发，选择任意一个实验。</p>
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

        <section className="method-section" aria-labelledby="method-title" id="method">
          <div className="section-heading">
            <div>
              <p className="eyebrow">课堂使用方式</p>
              <h2 id="method-title">教师设定任务，学生用证据推进解释</h2>
            </div>
          </div>
          <div className="method-card">
            <p>
              教师设定任务，学生调整参数、观察结果、记录变化，再用记录解释现象。课堂可以从任一实验进入，按目标安排观察、讨论与书面总结。
            </p>
            <ol className="method-list">
              <li>
                <strong>教师设定任务。</strong> 根据本节课的概念和时间，选择实验与需要回答的问题。
              </li>
              <li>
                <strong>学生调整参数。</strong> 一次改变一个变量，比较变化前后的结果。
              </li>
              <li>
                <strong>学生观察并记录。</strong> 记录画面、数值和像素状态，用证据支持自己的解释。
              </li>
            </ol>
          </div>
        </section>

        <section className="catalog-section" aria-labelledby="catalog-title" id="catalog">
          <div className="section-heading catalog-heading">
            <div>
              <p className="eyebrow">实验目录</p>
              <h2 id="catalog-title">按主题进入实验室</h2>
            </div>
            <span className="summary-note">{labs.length} 个实验 · 无需账号</span>
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
                            {lab.status === "available" ? "可探索" : "预览"}
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

      <footer className="home-footer">
        <span className="local-dot" aria-hidden="true" />
        <span>所有计算都在浏览器本地完成。</span>
        <span className="footer-divider" aria-hidden="true" />
        <span>适合课堂演示、个人探索与离线复习</span>
      </footer>
    </div>
  );
}
