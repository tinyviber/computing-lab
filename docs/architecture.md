# 当前架构

## 运行时边界

仓库是一个 Vite 包和一个 Node API 进程。前端入口是 `src/main.tsx`，应用路由集中在
`src/app/router.tsx`；六个有阶段和判题的课程 feature 是 `calculator`、`five-parts`、
`image-sampling`、`color-quantization`、`is-sim`、`decoding`。`audio-encoding` 是无
阶段、无判题 API 的浏览器演示；它仍在实验注册表中，默认隐藏并沿用管理员与班级可见性设置。
另有跨课程的 `task-sheets`（任务单）功能。

```text
src/app
  ├─ 页面编排、认证入口和课程路由
  └─ 非课程页面（登录、资料、管理、班级看板）

src/features/<lab>（calculator / five-parts / image-sampling / color-quantization / is-sim / decoding）
  ├─ domain：关卡、判题协议与纯计算（前端与服务端共享契约）
  ├─ lesson：URL/课程状态、引导和公开用例
  ├─ controller（按需）：组织 API、时钟、教学交互和界面 ViewModel
  ├─ ui：页面入口和展示组件；five-parts / decoding 的 Workspace 只接收 model / actions
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

实验可见性由管理员维护的 `hidden` 状态控制：未隐藏的实验向班级成员开放；隐藏时
非管理员无法访问首页入口、实验 API 或教师看板，管理员仍保留访问能力。

仍有真实消费者的跨页面基础设施只放在 `src/shared/auth`、`src/shared/api`、
`src/shared/layout` 与 `src/shared/lab`。旧的多实验导航、通用 lesson shell、
参数/公式/可视化面板以及 Slidev 编辑服务没有保留；它们在当前课程集合里不再
形成有价值的边界。

## 教学逻辑与视觉开发边界（five-parts / decoding 边界试点）

`FivePartsLabPage` / `DecodingLabPage` 只连接路由、认证、目录访问守卫和共享页面布局。
各 lab 的 `controller/use*LabController.ts` 负责项目加载、自动保存、判题和教学状态转换；
`createViewModel.ts` 从课程状态派生展示数据，`viewModel.ts` 定义按钮可用性、关卡状态
和用户意图 actions。`ui/` 下的 Workspace 与面板只消费这些展示契约，不触碰 lesson
状态机、domain 关卡表或 API；ESLint pilot 边界强制这一方向（页面入口文件豁免）。

`five-parts` 演示五大部件分工，共四页：观察页把「输入 → 存储 → 控制器下令 → 运算器 →
输出」走成四步高亮；思考页问「谁指挥运算器」；第 3 页让学生对一篇作文「打开 / 写一句 /
保存 / 断电 / 开机」，亲眼看到内存断电清空、外存保留，以及 CPU 只能读内存里的数据；
第 4 页把手机拍照映射到五大部件（触摸屏先作输入、后作输出）。第 2–4 页各有一道服务端
判分的选择题，正确答案与反馈文案只存在于 `server/judge/five-parts/judge.ts`，客户端
拿不到可读答案；完成观察后 2–4 页全部开放，题目之间互不阻塞。学生可见文案不得出现
PC/IR/汇编指令、寄存器表、程序编辑器等旧 CPU 实验词汇（issue #115）。

`/__dev/labs/five-parts`、`/__dev/labs/decoding` 仅在 `import.meta.env.DEV` 分支注册，
预览模块通过 lazy import 加载并在生产构建中消除。预览使用真实 Workspace 和公开数据
生成的固定 fixture，不调用 Controller hook、认证、存储或服务器隐藏判题。
开发预览跳过身份请求，离开该路由恢复正常认证；生产实验入口继续执行访问守卫。
详见 [视觉任务边界与验证](agent/ui-tasks.md)。

## 删除决策

除当前保留的 `calculator`、`five-parts`、`image-sampling`、`color-quantization`、`is-sim` 和
`decoding` 六个实验外，其他旧实验的 feature 目录、路由、实验 API、专属资产、e2e/单测和 Slidev
构建/编辑链路都已退役。原 `cpu` 实验（旧汇编机）已按 issue #115 整体移除并由
`five-parts` 重建：路由 `/labs/cpu` 落到 not-found，不再打开旧实验。
数据库仍使用通用的 `lab_id` 字段，以便保留旧部署数据的可读性，
但当前应用不会再读取或写入已删除实验的记录；本次没有做破坏性数据迁移，
历史 `lab_id='cpu'` 行（含 `cpu_guided_first_answers`）保留在原处，
`UNIQUE(user_id, lab_id)` 使它们与 `five-parts` 的新记录互不影响。

被移除实验的教学问题和重新实现门槛见 [retired-labs.md](retired-labs.md)。该记录不
是运行时契约，也不要求恢复任何通用 `LessonRuntime`、`Stepper`、`ScenarioCodec` 或
语义验证框架。
