# 实验视觉任务

Controller / Workspace / Preview 边界目前在 `five-parts` 与 `decoding` 两个 lab 落地
（ESLint pilot 边界只对这两个 `ui/` 目录生效）。其他实验按修改成本迁移，
不用为了目录对称进行重构。保持单 Vite 包，不引入通用 LessonRuntime 或新后端。

## redesign-<lab>-ui（以 five-parts 为例）

先读：

- `src/design/tokens.css`
- `src/features/five-parts/controller/viewModel.ts`（界面契约）
- `src/features/five-parts/ui/FivePartsWorkspace.tsx` 及需要修改的展示组件／CSS
- `src/features/five-parts/preview/`（公开、固定的展示场景）

普通视觉任务允许修改 `five-parts/ui/**`（除入口 `FivePartsLabPage.tsx`）和
`five-parts/preview/**`。不得修改 `server/**`、`five-parts/domain/**`、
`five-parts/lesson/**`、`five-parts/controller/**`、`src/shared/api/**`、
`src/shared/auth/**` 或全局 `base.css` / `app-layout.css`。
需要改契约或教学行为时，先把任务重新界定为教学开发任务。

保留现有 actions、禁用状态、锁定关卡、观察完成门槛和错误反馈。
Workspace 可以持有提示展开等视觉状态；步骤推进、答题、保存和判题由
Controller 管理。不要在 UI 新建状态机或自行 dispatch 教学 action。
StageRail 的关卡列表来自 view model 的 rail items（含 id/title/unlocked），
UI 不得再值导入 `domain/stages`。
新增 CSS 使用 `fp-` 命名空间和已有 tokens，不改变其他实验的共享样式。

学生可见文案（含提示、反馈、隐藏细节）不得出现旧汇编机词汇：PC、IR、
LOAD/STORE/HALT、M[xx]、寄存器表、操作码、指令、汇编等（issue #115）。
思考页正确选项只存在于服务端判题，UI 不得标注或暗示答案。

## 本地预览

运行 `bun run dev`，打开：

```text
/__dev/labs/five-parts?scenario=initial&viewport=desktop
/__dev/labs/decoding?scenario=<scene>&viewport=desktop
```

该路由仅在 Vite 开发模式注册，生产构建不含预览页面或 fixture。
无需 API、登录、数据库或真实学生数据；`App` 在该开发路由跳过身份请求，离开后恢复认证。
场景来自公开数据；five-parts 覆盖初始、改输入、四步高亮、思考页、答错、
内存与外存（未打开 / 写了没保存 / 断电 / 答对）、手机（未开始 / 输入 / 触摸屏输出 /
答错）、保存中、保存异常、加载异常等固定场景。判题反馈由服务端给出，预览只显示合成文字。

切换桌面／平板／手机会改变 iframe 的真实视口宽度，触发原页面媒体查询。
URL 可复现固定场景；非法参数回退到初始场景与桌面。
`frame=1` 是可直接截图的完整实验页，不显示外层预览工具。
预览 actions 只记录操作事件，不会驱动教学流程、执行计时或请求后端。
验证真实教学交互使用 Controller 单测和 `FivePartsLabPage.test.tsx`。

## 验证

本机命令必须串行执行，并遵守 `.codex/AGENTS.md` 的单 worker 限制：

```sh
nice -n 10 bun run vitest run src/features/five-parts --maxWorkers=1 --minWorkers=1
nice -n 10 bun run playwright test --config playwright.preview.config.ts --workers=1
```

预览 Playwright 独立启动 Vite，不启动 API，检查全部固定场景、三种视口、操作回调、
错误／禁用状态、无 API 请求和无浏览器异常，并把截图存入系统临时目录供审查。
Playwright 用例使用 `.e2e.ts` 命名，避免被 Vitest 的 `.test` / `.spec` 规则收集。
截图是审查证据，尚未建立跨机器像素基线；后续视觉重设计可在固定浏览器和字体环境中
添加经确认的基线。不要把本机生成的截图或报告混入提交。

编辑循环只跑受影响测试与检查；交付前按根 `AGENTS.md` 完整验证。
ESLint 约束纯 domain／lesson、Controller、试点 lab 展示层和 Preview 的依赖方向；
架构测试额外检查真实 Workspace 的传递运行时依赖，包含动态 import 和 re-export。
