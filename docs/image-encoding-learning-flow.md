# 图像编码：AI 修复老照片

> 2026-09 起本实验改为**分关课程**（见 issue #35 设计评审）。本文描述当前实现；旧的
> 连续探索模型只作为历史记录保留在 `image-encoding-optimization.md` /
> `image-encoding-pr-handoff.md`。

## 驱动问题

> AI 修复老照片，究竟是在“找回”已经丢失的信息，还是根据已有信息和模型先验
> 生成一个合理但未必真实的版本？

## 课堂结构（约 45 分钟）

三个必做核心关 + 两个选做挑战，左侧 `ImageStageRail` 显示进度：

| 关卡                             | 任务                                          | 客观通过条件                                              |
| -------------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| Core 1 约定决定 bit 的意义（8′） | 把 8×8 四符号画布的高亮行编成 16 bit          | `checkCore1`：学生位串与 `encodeRow` 一致                 |
| Core 2 在预算内保存（12′）       | 在分辨率档 × 颜色档中选一个组合“存下”照片     | `checkCore2`：`rawBits ≤ budget` 且目标区域平均误差 ≤ 12% |
| Core 3 丢掉的信息回不来（12′）   | 在目标区域 16×16 窗口里改原图，让编码签名不变 | `checkCore3`：≥ 8 个像素不同且编码签名完全相同            |
| Challenge 1 AI 修复（选做）      | 对照原图 / 编码结果 / 普通放大 / AI 修复      | 已生成的档位显示真实 AI 输出；未生成档位保持占位，不出题  |
| Challenge 2 抓幻觉（选做）       | 在 AI 修复图上点出“修错”的细节                | `checkChallenge2`：命中人工标注热点 ≥ 要求数              |

挑战关只在三个核心关全部通过后解锁（`isStageUnlocked`）。修改 artifact 会撤销
Core 2 / Core 3 的通过状态，防止用过期进度解锁挑战。

## Artifact 与档位

学生保存的“老照片”是一个可写进 URL 的确定性 artifact：

```text
artifact = { image, resStop, colorStop }
resStop   ∈ { 100, 50, 25, 10 }
colorStop ∈ { rgb24, gray8, palette8, palette4, palette2 }
```

离散档位让 artifact 能映射到离线预生成的 AI 修复案例（`restoration.ts` 的命名
契约：`restored/<image>-<resStop>-<colorStop>.webp`）。v1 不做实时模型推理。

Core 2 预算为源图理论 RGB24 数据量的 1/8（`DEFAULT_BUDGET_RATIO`）。所有数据量
仍是理论原始像素数据：

```text
rawBits = sampledWidth × sampledHeight × bitsPerPixel
rawBytes = ceil(rawBits / 8)
```

不是 PNG/JPEG/WebP 文件大小估算，UI 持续标注这条边界。

## URL 情境

```text
/labs/image-encoding?stage=2&image=photo&res=25&colors=palette8
```

- `stage` ∈ 1–5；`image` 选内置 fixture；`res`/`colors` 选档位。
- 旧参数继续可用：`sample`/`sampling` → 最近分辨率档，`bits`/`bitDepth`/`color`
  → 颜色档，`view=representation|compare|error` → stage 1/2/3，
  `scenario=low-sampling|high-quantization` → 兼容 fixture。
- URL 只携带可复现情境，不携带学习进度；非法值在 domain 边界归一化。
- 当 URL 显式给出 artifact 参数时，它优先于服务端保存的草稿。

## 持久化与服务端复核

班级路由 `/classes/:classId/labs/image-encoding` 提供：

- `GET project`：读取 `student_projects.draft_graph`（image 专用 sanitizer）。
- `PUT draft`：800ms 防抖自动保存 artifact + 各关草稿。
- `POST judge`：服务端用共享 `domain/checks.ts` 重新判定，不信任客户端的
  `passed`/`currentStage`。

两个持久化语义约定（与 calculator 一致，属平台级约束而非本实验特例）：

- 进度身份是 `(user_id, lab_id)`：同一学生在多个班级间共享同一份
  image-encoding 进度；`class_id` 只记录创建位置，成员资格仍按请求校验。
- `current_stage` 始终从 `passed_stages` 派生（第一个未完成的 core，
  三 core 全过后为 4），pass 与 artifact 撤销路径都重写它，不会出现
  “currentStage=4 但只过了 stage 1”的矛盾。
- `passed_artifact` 存在草稿内：artifact 一旦改变，绑定它的 2/3/4/5 关
  pass 在同一次写入中撤销，stage 1 不受影响。

旧入口 `/labs/image-encoding`：已登录且有班级 → 跳班级路由；无班级 → 提示加入；
匿名 → 直接在本地运行（无 API 依赖，静态预览/离线课堂可用，通过状态只存本地）。
API 不可用时本地判定先行，页面明确标注“未同步，需重新提交”。

## 测试

- domain：`stops`、`stages`、`bit-canvas`、`checks`、`restoration`、`model` 各带
  vitest；`checks.test.ts` 还回归“预算内既有多个可行解也有不可行解”。
- lesson：scenario 解析/序列化与状态迁移（含改 artifact 撤销通过状态）。
- ui：`ImageEncodingPage.test.tsx` 覆盖三关交互、解锁顺序与 URL 优先级。
- server：`server/judge/image.test.ts` + `server/routes/image-encoding.test.ts`。
- e2e：`tests/e2e/image-encoding.e2e.ts` 跑 Core 1→3 无外链请求闭环；
  `routes.e2e.ts` 覆盖 canonical/legacy URL 与历史恢复。

## 资产管线状态

`scripts/restoration/generate-inputs.ts` 按命名契约导出量化栅格 PNG +
manifest。已用仓库外工具（Real-ESRGAN ncnn `realesrgan-x4plus`，`-j 1:1:1`，
无 TTA）为 `photo` 生成 7 张输出并转为无损 WebP，入库于
`public/labs/image-encoding/restored/`，注册在
`domain/restoration.ts` 的 `RESTORATION_ASSETS`（含存在性测试）。

Challenge 1 对这些档位已展示真实 AI 输出。仍待办：

- `photo-50-gray8` / `photo-25-gray8` 目前只有超分结果，DDColor 上色未跑
  （模型登记仍为 `realesrgan-x4plus`，如实展示灰度输出）。
- `HALLUCINATION_CASES` 保持为空：幻觉热点需双人按
  `scripts/restoration/README.md` §4 复核后填写，因此 Challenge 2 仍是占位。
