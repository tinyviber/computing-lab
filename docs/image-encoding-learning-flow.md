# 图像编码：统一实验循环

## 学习目标

用户通过同一个反馈循环理解图像编码中的取舍：

```text
设定目标 → 改一个变量 → 看原图 / 重建图 → 看数据和平均 RGB 颜色差异 → 自己调整方案
```

默认目标是：在初始理论原始像素数据量的 25% 预算内，寻找更清晰的重建。预算固定、不可编辑，只用于比较理论像素数据量。

## 页面行为

- 首屏展示目标、固定预算、baseline/current 数字、delta、平均 RGB 颜色差异、变化像素和预算状态。
- 首屏建议先调采样率，但不锁定颜色、相位、视图、像素详情或计算器。
- 每次改动后，图像、采样尺寸、原始位数 / 字节、误差和语义反馈一起更新。
- 页面展示图像和数据变化，使用者根据结果调整参数。
- 原图和重建图继续使用同一显示坐标，视图 tab、误差图、编码网格和像素 inspector 继续可用。
- 原理区直接解释采样尺寸、颜色表示、像素编码和原始数据量；不按课程步骤解锁。
- 计算器用于计算数据量，格式边界说明始终可见。

## Baseline、current 和 delta

baseline 使用当前源图和初始情境配置生成。普通 slider 或按钮变化只更新 current；baseline 不因 current 调整重复派生。

```text
budgetBits = floor(baseline.rawPayload.bits × 0.25)
delta = currentSummary - baselineSummary
```

`changedPixelCount` 指当前重建图相对源图发生颜色差异的像素数，直接复用模型字段；它不是前后两次模型之间的变化像素数。

所有数据量都标注为理论原始像素数据：

```text
rawBits = sampledWidth × sampledHeight × bitsPerPixel
rawBytes = ceil(rawBits / 8)
```

这不是 PNG、JPEG 或 WebP 文件大小估算。实际格式大小受内容、编码方式、编码器设置、文件头、颜色表和元数据影响。

## 状态和兼容性

`state.ts` 仍保留 `samplingChanged`、`colorAdjusted`、`calculatorEdited`，以及既有 action、reset、scenario/source load 和 decode-error 行为。reducer 继续负责合法值归一化：

- RGB24 下 bit depth 不适用；
- 完整采样密度下 phase 固定为 0；
- 非法数值继续归一化；
- 上传失败不清空当前实验；
- URL 不携带学习进度。

这些 progress 字段不再控制 UI 锁定。页面只保留领域必要限制，不保留旧的四步硬锁流程。

## 保留能力

固定样例、兼容 fixture URL、legacy URL、上传、reset、实时画布、视图 tabs、误差图、相位几何、像素 inspector、palette / RGB24 语义和确定性模型继续保留。目标是让视觉观察、数字反馈和代价判断发生在同一实验上下文中。
