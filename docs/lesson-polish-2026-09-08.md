# Lesson polish — 2026-09-08

本轮针对 image-encoding 与 audio-encoding 两堂课堂实验页做"引导更自然、解释更跟手、卡点更少"的优化。本文记录实现落点与关键决策，并明确列出**拒绝了哪些原始建议及原因**。

## 范围与边界

- 只改 `src/features/audio-encoding`、`src/features/image-encoding` 与 `docs/`；不动路由、fixtures 数值、domain 纯函数算法、`src/shared/lab`、vite/vitest 配置；不新增 npm 依赖。

## Audio-encoding（音频课）

1. **三步实验路径卡（A1）**：把原"先做一个实验"focus card 升级为带编号 01/02/03 的实验路径卡（`data-testid="sound-experiment-path"`）。`data-active-step` 的规则写在组件注释中：mode 仍为 compare → 建议 01（A/B 听感阶段）；已进入混叠/量化实验但光标在起点 → 建议 02；光标离开起点（正在对照读数解释误差）→ 建议 03。原两个入口按钮（采样率实验/位深实验）的 dispatch 行为不变。
2. **phase 文案精确化（A2）**：label 从"相位"改为"采样偏移"，显示值仍为"{phase} 圈"，aria-label 同步；描述改为两句，明确"它不改变采样率"。
3. **分级重置（A3）**：aside 底部拆为三个动作——"回到起点"（`reset-transport`）、"重置分析视图"（`reset-analysis`）、"恢复默认状态"（完整 `reset`）。全部复用既有 reducer action，未新增 transport 类 action。
4. **声音证据解释卡（A4）**：新增 `SoundEvidenceCard`（`data-testid="sound-evidence-card"`），位于 sound-mode-evidence 之后。reducer 新增 evidence 状态与 `record-sound-baseline` / `record-sound-changed` / `set-sound-observation` / `clear-sound-evidence` 四个 action；快照记录当时 config 的 sampleRate/bitDepth 与当前 audition。保留策略：完整 `reset` 清空 evidence；`reset-analysis` 与 `reset-transport` 保留（改视图不应弄丢学生记录）。完成判定：两组设置的采样率或位深不同 + 解释非空；两次设置相同会提示"两次设置的采样率和位深相同"。状态行使用 `role="status"`，文案节奏对齐图像课 SamplingEvidenceCard。
5. **compare 证据补奈奎斯特提示（A5）**：`sound-compare-evidence` 增加一句动态提示，使用 `model.nyquistHz` 与既有 `formatNumber`，并引导学生切换到混叠实验观察。

## Image-encoding（图像课）

1. **三步实验路径卡（B1）**：mission card 之后、源图像卡之前插入实验路径卡（`data-testid="image-experiment-path"`）。`data-active-step` 规则写在组件注释中：view 非 compare → 建议 03（像素检查阶段）；任一参数偏离初始情境（采样比例/位深/颜色表示）→ 建议 02；否则建议 01。不改变任何既有卡片行为。
2. **phase label（B2）**："采样网格相位"改为"采样网格相位（采样偏移）"；`phaseControlDescription` 帮助文字未动。
3. **轻量回看入口（B3）**：在"编码表示"卡头部加"回到对比视图"按钮（`data-testid="image-back-to-compare"`），仅在 view 非 compare 时渲染，避免常态干扰；点击 `set-view compare`。

## 术语统一

两堂课的"圈数"表述统一为"采样偏移（圈）"体系：音频课控件 label"采样偏移"、图像课 label"采样网格相位（采样偏移）"。

## 拒绝了的原始建议及原因

1. **LabShell prompt-box / 课程 prompt 机制**：核实后 `src/shared/lab/LabShell.tsx` 并不存在该机制（也没有对应 props），且给 LabShell 塞课程语义违反"shared 层不得引入课程语义"的分层边界；相关验收测试明确禁止 LabShell 拥有 legacy slots。改为在各 feature UI 内实现实验路径卡。
2. **盲目 memoization（memoizedSamplingGeometry、引入 memoization 库）**：现有 useMemo 已覆盖派生模型与 plot 等热路径；图像课的采样几何派生本身是 O(采样数) 的纯计算，缓存收益不明朗且引入跨渲染失效风险。本轮不做。
3. **大规模 useEffect 重排**：现有 effect 顺序（scenario 同步、播放窗口、音频运行时、rAF 时钟）职责清晰，重排属于高风险低收益重构，违背"以测试通过为先"的约束。不做。
4. **音频 evidence 快照记录时间戳**：学生操作中时间戳无教学价值，还会引入 `Date`/`performance` 等被架构测试禁止的依赖面（lesson 层禁止 clock 语义）。不记录。

## 第三轮（评委必改项）

评委终审"合格但需改进"，4 个必改项全部落地：

1. **图像课侦探卡因果句式（高）**：观察输入 placeholder 从现象示例（"例如：边缘变粗，细节减少"）改为因果句式："把 空间采样 从 100% 改到 25% 后，我观察到 ____，因为 ____。"（含"因为"因果引导，对齐音频课证据卡句式精神）。
2. **图像课术语统一（高）**：phase 控件主标签改为"采样偏移（圈）"，与音频课一致；`phaseControlDescription` 各分支末尾统一补一句"过去也叫相位：它只移动采样网格的位置，不改变采样率。"（保留历史叫法对照，不删原说明内容）。
3. **音频课三级重置自解释化（中）**：按钮标签改为"光标回到开头 / 重置实验与视图 / 恢复全部默认设置"；每个按钮 aria-label 说明作用域（含"不影响你的记录 / 保留记录 / 会清空证据卡记录，请谨慎"）；组上方常显一行 muted 小字："重置不影响证据卡记录；『恢复全部默认设置』会清空记录。"零 reducer 改动。
4. **图像课移动端首屏密度（中）**：≤720px 断点用 CSS order 把原图/重建图对比区提前到路径卡之后（mission → 路径卡 → 对比区 → 源图像 → 侦探卡 → 编码表示）；纯视觉 order，不改 DOM/标题层级，桌面端不变。验收：390×844 首屏可见路径卡与对比区。

**评委 3 条"下一版建议"未纳入本轮**（team-lead 裁定）：均为超出必改范围的新功能/重构（详见评审记录），为控制本轮风险与回归面，统一留待下一版本评估。

## 第二轮（视觉审查打回修复）

1. **步进按钮（blocker）**："前进 100 毫秒"从 `dispatch tick` 改为 `seek(cursor + 100)`（仅在 `durationMs <= 0` 时 disabled）。停止态也能步进光标（支撑步骤 03），播放态等价 seek、不中断播放。既有 audioPlayback 测试中"播放态步进不重建音源"的断言随行为变更同步更新：播放态步进现在与拖动光标一致，在新的光标位置重启音源。
2. **路径步骤三态（major）**：两堂课路径步骤新增 `data-step-state="done|current|todo"`（规则：序号 < 建议步 → done；= → current；> → todo）。样式：current = 主题色实心底白字（`--accent`）；done = 浅灰填充（`--subtle`）+ 次级文字；todo = 描边 + 默认底。两课视觉语言统一（图像课 todo 底色从 `--subtle` 调整为 `--surface` 以与音频课一致）。
3. **移动端重置区（minor）**：767px 断点下"回到起点"/"重置分析视图"两列一行，"恢复默认状态"独占一行，按钮 padding/min-height 略减；零交互改动。
4. **.prettierignore**：追加 `.workbuddy/`，视觉审查临时产物不再影响 format:check 门禁。
5. **明确不修**：图像课路径卡位置（符合原审定需求，等评委终审统一决策）。

## 检查与测试

- 新增/更新的测试：
  - `src/features/audio-encoding/lesson/state.test.ts`：evidence 记录基准/改变后快照、两次相同不算完成、完成后判定、reset 清空、reset-analysis/reset-transport 保留。
  - `src/features/audio-encoding/ui/AudioEncodingPage.test.tsx`：路径卡 data-active-step 01→02→03、证据卡两组记录与徽章状态、两次相同提示、分级重置可用且不丢记录、compare 证据含奈奎斯特频率、phase 控件更名为"采样偏移"。
  - `src/features/image-encoding/ui/ImageEncodingPage.test.tsx`：路径卡 data-active-step 01→02→03、"回到对比视图"按钮行为。
- 新增 data-testid：`sound-experiment-path`、`sound-evidence-card`、`image-experiment-path`、`image-back-to-compare`。
- 第二轮新增/调整测试：路径步骤 `data-step-state` 三态断言（音频课）；停止态步进光标 +100ms 且路径卡推进到 03、播放态步进不中断播放；audioPlayback 播放态步进断言随 seek 行为同步更新。
