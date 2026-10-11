# 当前架构

## 运行时边界

仓库是一个 Vite 包和一个 Node API 进程。前端入口是 `src/main.tsx`，应用路由集中在
`src/app/router.tsx`；六个有阶段和判题的课程 feature 是 `calculator`、`cpu`、
`image-sampling`、`color-quantization`、`is-sim`、`decoding`。`audio-encoding` 是无
阶段、无判题 API 的浏览器演示；它仍在实验注册表中，默认隐藏并沿用管理员与班级可见性设置。
另有跨课程的 `task-sheets`（任务单）功能。

```text
src/app
  ├─ 页面编排、认证入口和课程路由
  └─ 非课程页面（登录、资料、管理、班级看板）

src/features/<lab>（calculator / cpu / image-sampling / color-quantization / is-sim / decoding）
  ├─ domain：关卡、判题协议与纯计算（前端与服务端共享契约）
  ├─ lesson：URL/课程状态、引导和公开用例
  ├─ controller（按需）：组织 API、时钟、教学交互和界面 ViewModel
  ├─ ui：页面入口和展示组件；CPU Workspace 只接收 model / actions
  └─ preview（按需）：开发环境的公开固定场景，复用真实 Workspace

src/features/task-sheets
  └─ 任务单模板、班级布置、学生作答与批改界面

src/features/audio-encoding
  └─ 本地音频采样 / 量化演示；可见性由 `server/labs.ts` 控制，页面入口也检查目录权限

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
关卡数、saveDraft、judge）；不引入通用 `LessonRuntime`/
`Stepper` 框架。

CPU 引导题的首答通过独立的 `/guided-answer` 请求在判题前写入
`cpu_guided_first_answers`；唯一键让记录不可覆盖，判题从服务端读取它生成教师预测详情，
不接受 `/judge` 客户端提交的首答副本。

实验可见性由管理员维护的 `hidden` 状态控制：未隐藏的实验向班级成员开放；隐藏时
非管理员无法访问首页入口、实验 API 或教师看板，管理员仍保留访问能力。

仍有真实消费者的跨页面基础设施只放在 `src/shared/auth`、`src/shared/api`、
`src/shared/layout` 与 `src/shared/lab`。旧的多实验导航、通用 lesson shell、
参数/公式/可视化面板以及 Slidev 编辑服务没有保留；它们在当前课程集合里不再
形成有价值的边界。

## 教学逻辑与视觉开发边界（CPU 试点）

`CpuLabPage` 只连接路由、认证、目录访问守卫和共享页面布局。
`cpu/controller/useCpuLabController.ts` 负责项目加载、自动保存、首答记录、判题、
教学状态转换和时钟。`createViewModel.ts` 从同一执行轨迹派生展示数据；
`viewModel.ts` 定义按钮可用性、关卡状态、预测题和机器展示数据及用户意图 actions。

`CpuWorkspace`、`CpuStageRail` 和 `GuidedPanel` 只消费这些展示契约。
其他专用图表仍可以使用 ISA 格式转换和只读轨迹类型，不能执行模拟器或访问 API。
原有 `pending trace + phase + cursor` 同步语义、playback identity、完整轨迹与
独立可见行数、全部公开用例的观察门槛保持不变。

`/__dev/labs/cpu` 仅在 `import.meta.env.DEV` 分支注册，预览模块通过 lazy import
加载并在生产构建中消除。它使用真实 Workspace 和公开数据生成的固定 fixture，
不调用 Controller hook、认证、存储或服务器隐藏判题。
开发预览跳过身份请求，离开该路由恢复正常认证；生产实验入口继续执行访问守卫。
详见 [视觉任务边界与验证](agent/ui-tasks.md)。

## 删除决策

除当前保留的 `calculator`、`cpu`、`image-sampling`、`color-quantization`、`is-sim` 和
`decoding` 六个实验外，其他旧实验的 feature 目录、路由、实验 API、专属资产、e2e/单测和 Slidev
构建/编辑链路都已退役。数据库仍使用通用的 `lab_id` 字段，以便保留旧部署数据的可读性，
但当前应用不会再读取或写入已删除实验的记录；本次没有做破坏性数据迁移。

被移除实验的教学问题和重新实现门槛见 [retired-labs.md](retired-labs.md)。该记录不
是运行时契约，也不要求恢复任何通用 `LessonRuntime`、`Stepper`、`ScenarioCodec` 或
语义验证框架。
