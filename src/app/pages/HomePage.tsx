import { Link } from "@tanstack/react-router";
import { labs } from "../catalog/labs";
import "./home.css";

const featuredLab = labs.find((lab) => lab.id === "image-encoding") ?? labs[0];
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
            <p className="eyebrow">INTERACTIVE COMPUTING / 01</p>
            <h1 id="home-title">交互式计算实验</h1>
            <p className="home-lede">
              不先背结论。把一个系统拆开、改变它、观察证据，再用自己的话解释它为什么这样工作。
            </p>
            <div className="home-hero-actions">
              <Link className="button button-primary" to={featuredLab.route}>
                开始图像编码 <span aria-hidden="true">→</span>
              </Link>
              <a className="button button-secondary" href="#catalog">
                浏览全部实验
              </a>
            </div>
            <div className="home-proof-row" aria-label="平台特征">
              <span>
                <strong>10</strong> 个实验主题
              </span>
              <span>
                <strong>100%</strong> 浏览器本地运行
              </span>
              <span>
                <strong>0</strong> 个需要死记的黑盒
              </span>
            </div>
          </div>
          <div className="home-hero-visual" aria-label="图像编码实验预览">
            <div className="visual-window-bar">
              <span>图像编码 / 01</span>
              <span>探索中</span>
            </div>
            <div className="visual-grid">
              {Array.from({ length: 48 }, (_, index) => (
                <span className={`visual-pixel visual-pixel-${index % 8}`} key={index} />
              ))}
            </div>
            <div className="visual-caption">
              <span>source raster → reconstruction</span>
              <strong>采样 · 量化 · bits</strong>
            </div>
          </div>
        </section>

        <section className="featured-section" aria-labelledby="featured-title" id="method">
          <div className="section-heading">
            <div>
              <p className="eyebrow">推荐起点</p>
              <h2 id="featured-title">先做一个看得见的实验</h2>
            </div>
            <span className="summary-note">约 20 分钟</span>
          </div>
          <Link className="featured-card" to={featuredLab.route}>
            <div className="featured-index">01</div>
            <div className="featured-body">
              <div className="featured-topline">
                <span className="category-label">{featuredLab.category}</span>
                <span className="featured-state">可直接开始</span>
              </div>
              <h3>{featuredLab.title}</h3>
              <p>把一张图像拆成采样、颜色状态和索引 bits，最后自己设计一份可解释的编码方案。</p>
              <span className="featured-action">
                打开任务单 <span aria-hidden="true">↗</span>
              </span>
            </div>
            <div className="featured-metrics" aria-label="实验关注点">
              <span>
                <b>3</b>
                <small>种证据视图</small>
              </span>
              <span>
                <b>2</b>
                <small>个核心变量</small>
              </span>
              <span>
                <b>1</b>
                <small>条因果链</small>
              </span>
            </div>
          </Link>
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
