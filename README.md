# computing-lab

校内信息技术实验运行时。Vite + React SPA 加一个极简 Node API（认证 / 草稿 / 判题 / 看板）。
仓库还包含一个在线课程编辑器服务，用于在浏览器里直接编辑 Slidev 课程源文件。

## 本地开发

```sh
bun install
node server/db/seed.ts   # 建一个班级 + 教师账号（见 .env.example）
node server/index.ts     # API 服务 :8788（也会服务构建出的 dist/）
bun run dev              # Vite 开发服 :5173，/api 代理到 :8788
```

默认种子：班级 `2026-高一信息技术-01`，邀请码 `CLASS26`；管理员学号 `admin`，
密码 `admin-dev-password`（`LAB_ADMIN_PASSWORD` 覆盖）；教师学号 `teacher`，
密码 `teacher-dev-password`（用 `LAB_TEACHER_PASSWORD` 覆盖）。

角色分三级：`admin`（管理员）拥有全部教师权限，并在 `/admin` 管理账号与班级；
`teacher` 可查看所教班级的看板和未开放实验；`user` 是学生。自助注册已关闭，
账号只能由管理员在 `/admin` 单个创建或批量导入（CSV 或 JSON，格式
`学号,姓名,密码[,角色][,班级邀请码]`）。

学生流程：管理员导入账号并把学生分配进班级 → `/login` 登录 → 首页进入
`/classes/:classId/labs/calculator` → 画布连线 → 公开测试 → 提交（服务端隐藏
用例判定，全过才解锁下一关并把成果封装成可复用组件）。教师入口
`/classes/:classId/dashboard`。

图像编码实验（`图像编码` / “AI 修复老照片”）：`/classes/:classId/labs/image-encoding`
按 `stage=1..5` 组织——约定表编码、预算内保存、many-to-one 信息损失三个核心关
由服务端复核；AI 修复与抓幻觉为选做挑战。Challenge 1 已展示
`public/labs/image-encoding/restored/` 下预生成的 Real-ESRGAN 输出
（生成管线见 `scripts/restoration/`）；Challenge 2 在双人复核幻觉热点前
保持占位（`HALLUCINATION_CASES` 为空）。匿名访客仍可在
`/labs/image-encoding` 本地体验，离线无 API 依赖。

## Online lesson editor

Open `/editor` through the editor service. It provides a browser workspace
with a Markdown/code editor on the left and a real Slidev hot-reload preview on the right. Saving
a file writes it directly to `lessons/<lesson>/`, so there is no GitHub/Gitee promotion step in
the editing loop. Access is limited to accounts with the `admin` role: the service verifies the
lab's `lab_session` cookie against the SQLite account database (`LAB_DB_PATH`, default
`data/lab.db`).

For local development, run:

```sh
bun run editor:dev
```

Then open <http://localhost:8787/editor>. `editor:dev` starts the React/Vite app, the editor API,
and Slidev preview processes as needed. In a server checkout that already has a built `dist/`,
run `bun run editor:start` instead.

`EDITOR_ROOT` can point the service at another checkout, and `EDITOR_PORT` changes the editor
HTTP port. Source files with `.md`, `.vue`, `.css`, `.js`, `.ts`, `.tsx`, `.json`, or `.html`
extensions are editable; image assets are listed as read-only.

## 质量门槛

```sh
bun run format:check
bun run lint
bun run typecheck          # 注：根 tsconfig 是 references-only，历史上是空转
bun run typecheck:app      # 前端真实类型检查（存量代码尚有遗留错误）
bun run typecheck:server   # server/ 与共享 domain 的真实类型检查
bun run test:run
bun run test:e2e
bun run build              # build:slides 需 Node ≥22（本机 bun 旧版跑不动 slidev）
```

## 架构边界

- `src/app` 路由与 catalog；`src/features/<lab>/{domain,lesson,ui}` 分层；
  `src/shared/{lab,auth,api}` 跨特性原语。`architecture-boundaries.test.ts` 强制约束。
- `server/` 是 Node ≥22.13 单进程：Hono + `node:sqlite`，`data/lab.db` 单文件库。
  判题器复用 `src/features/calculator/domain` 的纯求值器；隐藏用例只在 `server/`。
- `server/editor-server.mjs` 是独立的在线编辑器服务（见上节），与实验 API 互不依赖。
- 旧实验通过 `src/app/catalog/labs.ts` 的 `enabled` 标志隐藏而非删除；
  教师或 `?showExperimentalLabs=1` 仍可访问。

## 部署（暂沿静态管线，待接入 API 进程）

现状：GitHub `main` → CI 镜像 Gitee → 服务器 pull + reconcile → Caddy 静态托管 `dist/`。
见 [docs/deployment.md](docs/deployment.md)。接实验 API 时需新增：`node server/index.ts`
的 systemd unit + Caddy `reverse_proxy /api/*` → `127.0.0.1:8788`（同进程已能直接
服务 dist，也可去掉静态托管）。

The online editor is a separate long-running service: place a reverse proxy in front of its
`EDITOR_PORT`, enable WebSocket upgrades for Slidev HMR, and point `LAB_DB_PATH` at the account
database so admin sessions resolve. It
writes the configured `EDITOR_ROOT/lessons` checkout directly and therefore does not use the
static promotion loop.

Run deterministic deployment checks with:

```sh
bun run test:deploy
```
