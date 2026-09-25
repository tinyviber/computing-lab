# 当前架构

## 运行时边界

仓库是一个 Vite 包和一个 Node API 进程。前端入口是 `src/main.tsx`，应用路由集中在
`src/app/router.tsx`；课程 feature 有 `calculator`、`cpu`、`image-sampling`、
`color-quantization`、`is-sim`、`network` 六个，另有跨课程的 `task-sheets`（任务单）功能。

```text
src/app
  ├─ 页面编排、认证入口和课程路由
  └─ 非课程页面（登录、资料、管理、班级看板）

src/features/<lab>（calculator / cpu / image-sampling / color-quantization / is-sim / network）
  ├─ domain：关卡、判题协议与纯计算（前端与服务端共享契约）
  ├─ lesson：URL/课程状态、引导和公开用例
  └─ ui：画布、控制器、提示和提交界面

src/features/task-sheets
  └─ 任务单模板、班级布置、学生作答与批改界面

src/shared/lab
  └─ 各实验页共用的薄封装：useLabProject（加载）、
     useAutosaveDraft（防抖自动保存）、LabAccessGate/SaveIndicator（入口守卫）

server
  ├─ auth/db/http：认证、SQLite 和请求边界
  ├─ routes：auth、admin、dashboard、task-sheets、task-assignments，
  │          以及经 labRoutes 工厂挂载的各实验管线
  │          （project → draft → judge）
  └─ judge：服务端隐藏用例和持久化进度
```

`server/routes/labRoutes.ts` 是各实验共用的薄管线：GET project 装载
`{currentStage, passedStages, drafts, ...extras}`，PUT draft 防抖持久化，
POST judge 跑隐藏用例并推进 `passedStages`。每个实验只提供 spec（labId、
关卡数、adminPreview、saveDraft、judge）；不引入通用 `LessonRuntime`/
`Stepper` 框架。

仍有真实消费者的跨页面基础设施只放在 `src/shared/auth`、`src/shared/api`、
`src/shared/layout` 与 `src/shared/lab`。旧的多实验导航、通用 lesson shell、
参数/公式/可视化面板以及 Slidev 编辑服务没有保留；它们在当前课程集合里不再
形成有价值的边界。

## 删除决策

除了 calculator、cpu、is-sim、network 四个正式实验和 image-sampling、color-quantization 两个管理员
预览实验的 feature 目录、路由、实验 API、专属资产、e2e/单测和 Slidev 构建/编辑
链路都已退役。数据库仍使用通用的 `lab_id` 字段，以便保留旧部署数据的可读性，但当前
应用不会再读取或写入已删除实验的记录；本次没有做破坏性数据迁移。

被移除实验的教学问题和重新实现门槛见 [retired-labs.md](retired-labs.md)。该记录不
是运行时契约，也不要求恢复任何通用 `LessonRuntime`、`Stepper`、`ScenarioCodec` 或
语义验证框架。
