# 实验视觉任务

CPU 是 Controller / Workspace / Preview 边界的首个试点。其他实验按修改成本迁移，
不用为了目录对称进行重构。保持单 Vite 包，不引入通用 LessonRuntime 或新后端。

## redesign-cpu-ui

先读：

- `src/design/tokens.css`
- `src/features/cpu/controller/viewModel.ts`（界面契约）
- `src/features/cpu/ui/CpuWorkspace.tsx` 及需要修改的展示组件／CSS
- `src/features/cpu/preview/`（公开、固定的展示场景）

普通视觉任务允许修改 `cpu/ui/**`（除入口 `CpuLabPage.tsx`）和 `cpu/preview/**`。
不得修改 `server/**`、`cpu/domain/**`、`cpu/lesson/**`、`cpu/controller/**`、
`src/shared/api/**`、`src/shared/auth/**` 或全局 `base.css` / `app-layout.css`。
需要改契约或教学行为时，先把任务重新界定为教学开发任务。

保留现有 actions、禁用状态、锁定关卡、预测题提示、观察完成门槛和错误反馈。
Workspace 可以持有 Tab、提示展开等视觉状态；时钟、游标、预测答题、保存和判题由
Controller 管理。不要在 UI 新建模拟器或自行 dispatch 教学 action。
专用图表可接收只读轨迹并做显示格式转换；禁止修改输入 model。
`TraceRows` 必须接收完整轨迹和独立的 visibleCount，不能切片后把中间行误算为最终寄存器值。
新增 CSS 使用 `cpu-` 命名空间和已有 tokens，不改变其他实验的共享样式。

## 本地预览

运行 `bun run dev`，打开：

```text
/__dev/labs/cpu?scenario=initial&viewport=desktop
```

该路由仅在 Vite 开发模式注册，生产构建不含预览页面或 fixture。
无需 API、登录、数据库或真实学生数据；`App` 在该开发路由跳过身份请求，离开后恢复认证。
场景来自公开数据，包含初始、运行中、教学阻塞、判题失败、挑战编辑、正在保存、
保存异常、加载异常、字节锁定和 ALU 执行。

切换桌面／平板／手机会改变 iframe 的真实视口宽度，触发原页面媒体查询。
URL 可复现固定场景；非法参数回退到初始场景与桌面。
`frame=1` 是可直接截图的完整实验页，不显示外层预览工具。
预览 actions 只记录操作事件，不会驱动教学流程、执行计时或请求后端。
验证真实教学交互使用 Controller 单测和原有 `CpuLabPage.test.tsx`。

## 验证

本机命令必须串行执行，并遵守 `.codex/AGENTS.md` 的单 worker 限制：

```sh
nice -n 10 bun run vitest run src/features/cpu --maxWorkers=1 --minWorkers=1
nice -n 10 bun run playwright test --config playwright.preview.config.ts --workers=1
```

预览 Playwright 独立启动 Vite，不启动 API，检查全部固定场景、三种视口、操作回调、
错误／禁用状态、无 API 请求和无浏览器异常，并把截图存入系统临时目录供审查。
Playwright 用例使用 `.e2e.ts` 命名，避免被 Vitest 的 `.test` / `.spec` 规则收集。
截图是审查证据，尚未建立跨机器像素基线；后续视觉重设计可在固定浏览器和字体环境中
添加经确认的基线。不要把本机生成的截图或报告混入提交。

编辑循环只跑受影响测试与检查；交付前按根 `AGENTS.md` 完整验证。
ESLint 约束纯 domain／lesson、Controller、CPU 展示层和 Preview 的依赖方向；
架构测试额外检查真实 Workspace 的传递运行时依赖，包含动态 import 和 re-export。
