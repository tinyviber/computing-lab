# 当前架构

## 运行时边界

仓库是一个 Vite 包和一个 Node API 进程。前端入口是 `src/main.tsx`，应用路由集中在
`src/app/router.tsx`；目前唯一的课程 feature 是 `src/features/calculator`。

```text
src/app
  ├─ 页面编排、认证入口和 calculator 路由
  └─ 非课程页面（登录、资料、管理、班级看板）

src/features/calculator
  ├─ domain：电路图、纯求值器、关卡和组件规则
  ├─ lesson：URL/课程状态、引导和公开用例
  └─ ui：画布、控制器、提示和提交界面

server
  ├─ auth/db/http：认证、SQLite 和请求边界
  ├─ routes：calculator、dashboard、admin、auth
  └─ judge：服务端隐藏用例和持久化进度
```

仍有真实消费者的跨页面基础设施只放在 `src/shared/auth`、`src/shared/api` 和
`src/shared/layout`。旧的多实验导航、通用 lesson shell、参数/公式/可视化面板以及
Slidev 编辑服务没有保留；它们在只有一个课程 feature 的产品里不再形成有价值的边界。

## 删除决策

除了 calculator 的 feature 目录、路由、实验 API、专属资产、e2e/单测和 Slidev 构建/编辑
链路都已退役。数据库仍使用通用的 `lab_id` 字段，以便保留旧部署数据的可读性，但当前
应用不会再读取或写入已删除实验的记录；本次没有做破坏性数据迁移。

被移除实验的教学问题和重新实现门槛见 [retired-labs.md](retired-labs.md)。该记录不
是运行时契约，也不要求恢复任何通用 `LessonRuntime`、`Stepper`、`ScenarioCodec` 或
语义验证框架。
