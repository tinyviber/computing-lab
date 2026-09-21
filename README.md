# computing-lab

校内信息技术实验运行时：一个 Vite + React SPA，加一个极简 Node API，当前只提供
「实现ALU」（`calculator`）这一堂可运行的实验。

## 本地开发

```sh
bun install --frozen-lockfile
node server/db/seed.ts
node server/index.ts
bun run dev
```

默认种子会创建班级 `2026-高一信息技术-01`、邀请码 `CLASS26`、管理员账号
`admin` 和教师账号 `teacher`。密码可分别用 `LAB_ADMIN_PASSWORD`、
`LAB_TEACHER_PASSWORD` 覆盖。

学生流程是：管理员创建账号并分配班级 → `/login` 登录 → 首页进入
`/classes/:classId/labs/calculator` → 用逻辑门连接电路 → 运行公开测试 → 提交，
由服务端隐藏用例判定并解锁后续关卡。教师和管理员可在
`/classes/:classId/dashboard` 查看班级进度，管理员可在 `/admin` 管理账号与班级。

旧实验和 Slidev 在线课件已经从运行时、构建链路和测试中移除；它们的教学 idea 集中
记录在 [docs/retired-labs.md](docs/retired-labs.md)。

## 质量门槛

```sh
bun run format:check
bun run lint
bun run typecheck
bun run test:run
bun run build
bun run test:e2e
```

`typecheck` 会分别检查前端、Node API 和构建/测试配置；不要用根目录的空
project-reference 配置替代这三个检查。

`test:e2e` 需要本机或 CI 已安装 Playwright 浏览器。部署相关检查按需运行：

```sh
bun run test:deploy
bun run test:caddy
```

## 架构边界

- `src/app` 只负责路由和页面编排；calculator 的课程语义在
  `src/features/calculator/{domain,lesson,ui}` 内闭合。
- `server/` 是 Node ≥22.13 单进程，负责认证、草稿、判题和班级看板；隐藏用例只在
  `server/`，纯电路求值器由前端与服务端共享。
- `src/shared/{auth,api,layout}` 只保留认证、请求和应用顶栏等仍有真实消费者的基础设施。
- 数据库中的旧 `lab_id` 记录不会被迁移脚本主动删除；它们已没有对应路由或服务端处理器，
  不影响当前 calculator 流程。

部署说明见 [docs/deployment.md](docs/deployment.md)。
