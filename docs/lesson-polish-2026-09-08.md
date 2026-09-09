# Lesson polish — 2026-09-08

本轮针对 image-encoding 与 audio-encoding 两堂课堂实验页做"引导更自然、解释更跟手、卡点更少"的优化。当前实现以自由探索为主；本文记录实现落点与关键决策，并明确列出**拒绝了哪些原始建议及原因**。

## 范围与边界

- 只改 `src/features/audio-encoding`、`src/features/image-encoding` 与 `docs/`；不动路由、fixtures 数值、domain 纯函数算法、`src/shared/lab`、vite/vitest 配置；不新增 npm 依赖。

## Audio-encoding（音频课）

1. **静态实验建议（A1）**：将原实验路径卡收敛为几条可选线索：先听原始/重建音频，每次只改采样率或位深中的一个，记录设置和听感差异。不再渲染 01/02/03、`data-active-step` 或 `done/current/todo`。
2. **phase 文案精确化（A2）**：label 从"相位"改为"采样偏移"，显示值仍为"{phase} 圈"，aria-label 同步；描述明确它只移动采样位置，不改变采样率。
3. **分级重置（A3）**：光标复位放回播放控制；aside 底部保留"重置实验与视图"和"恢复初始设置并清空记录"，并说明两者对笔记的影响。
4. **声音实验笔记（A4）**：`SoundEvidenceCard` 记录 A/B 快照和开放式观察文字。删除完成判断、completion badge 和 identical-settings failure 语义；full reset 清空笔记，lighter resets 保留笔记。
5. **compare 证据补奈奎斯特提示（A5）**：`sound-compare-evidence` 增加一句动态提示，使用 `model.nyquistHz` 与既有 `formatNumber`，并引导学生切换到混叠实验观察。

## Image-encoding（图像课）

1. **静态实验建议（B1）**：在图像对比和笔记之后放置可选线索卡：先比较原图/重建图，每次只改一个参数，最后写一句观察。不根据当前控件状态标记学习进度。
2. **phase label（B2）**：控件改为"采样偏移（圈）"；说明保留历史叫法，并明确只移动采样位置、不改变采样率。
3. **轻量回看入口（B3）**：在"编码表示"卡头部加"回到对比视图"按钮（`data-testid="image-back-to-compare"`），仅在 view 非 compare 时渲染，避免常态干扰；点击 `set-view compare`。

## 术语统一

两堂课的"圈数"表述统一为"采样偏移（圈）"体系：音频课控件 label"采样偏移"、图像课 label"采样偏移（圈）"。

## 拒绝了的原始建议及原因

1. **LabShell prompt-box / 课程 prompt 机制**：核实后 `src/shared/lab/LabShell.tsx` 并不存在该机制（也没有对应 props），且给 LabShell 塞课程语义违反"shared 层不得引入课程语义"的分层边界；相关验收测试明确禁止 LabShell 拥有 legacy slots。实验建议继续由各 feature UI 自己拥有。
2. **盲目 memoization（memoizedSamplingGeometry、引入 memoization 库）**：现有 useMemo 已覆盖派生模型与 plot 等热路径；图像课的采样几何派生本身是 O(采样数) 的纯计算，缓存收益不明朗且引入跨渲染失效风险。本轮不做。
3. **大规模 useEffect 重排**：现有 effect 顺序（scenario 同步、播放窗口、音频运行时、rAF 时钟）职责清晰，重排属于高风险低收益重构，违背"以测试通过为先"的约束。不做。
4. **音频 evidence 快照记录时间戳**：学生操作中时间戳无教学价值，还会引入 `Date`/`performance` 等被架构测试禁止的依赖面（lesson 层禁止 clock 语义）。不记录。

## 第三轮（评委必改项）

评委终审"合格但需改进"，4 个必改项全部落地：

1. **图像课侦探卡因果句式（高）**：本轮进一步把证据输入改为开放式“我观察到……”，辅助说明不强迫使用“现象 + 因为”的固定句式。
2. **图像课术语统一（高）**：phase 控件主标签改为“采样偏移（圈）”，主要说明也使用采样偏移；仅在历史叫法说明中保留“相位”。
3. **音频课重置层级（中）**：光标复位放在播放控制附近；分析视图重置与会清空 A/B 笔记的完整重置分开，并在界面说明影响范围。
4. **图像课移动端信息顺序（中）**：删除用于强行提前课程辅助卡片的大量 CSS `order`，调整 DOM 后让移动端自然先看到图像对比区。

**评委 3 条"下一版建议"未纳入本轮**（team-lead 裁定）：均为超出必改范围的新功能/重构（详见评审记录），为控制本轮风险与回归面，统一留待下一版本评估。

## 第二轮（视觉审查打回修复）

1. **步进按钮（blocker）**："前进 100 毫秒"从 `dispatch tick` 改为 `seek(cursor + 100)`（仅在 `durationMs <= 0` 时 disabled）。停止态也能步进光标，播放态等价 seek、不中断播放。既有 audioPlayback 测试中"播放态步进不重建音源"的断言随行为变更同步更新：播放态步进现在与拖动光标一致，在新的光标位置重启音源。
2. **路径步骤三态（major）**：已由静态实验建议替代；不再维护 `data-step-state` 或路径样式。
3. **移动端重置区（minor）**：播放位置复位与播放控制相邻；分析/全量重置分开并明确是否清空笔记。
4. **.prettierignore**：追加 `.workbuddy/`，视觉审查临时产物不再影响 format:check 门禁。
5. **图像课信息顺序**：旧路径卡已移除；对比区、视图和实验笔记在 DOM 中先于静态建议与源图管理区，移动端自然按此顺序排列。

## 检查与测试

- 新增/更新的测试：
  - `src/features/audio-encoding/lesson/state.test.ts`：A/B 快照、重新记录 baseline 清空 changed/observation、reset 清空、lighter resets 保留。
  - `src/features/audio-encoding/ui/AudioEncodingPage.test.tsx`：静态建议、开放式笔记、分级重置、compare 证据含奈奎斯特频率、phase 控件更名为"采样偏移"。
  - `src/features/image-encoding/lesson/state.test.ts`：采样 A/B 笔记重新记录 baseline 时清空旧记录。
  - `src/features/image-encoding/ui/ImageEncodingPage.test.tsx`：静态建议、开放式观察、"回到对比视图"按钮行为。
- 第二轮新增/调整测试：停止态步进光标 +100ms 且播放态步进不中断播放；audioPlayback 播放态步进断言随 seek 行为同步更新。
