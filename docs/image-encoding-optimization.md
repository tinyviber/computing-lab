# 图像编码实验优化记录

## 核心体验

图像编码 lab 围绕一个循环组织，而不是分别实现五个 UX 原则：

```text
目标 → 修改一个变量 → 观察视觉 / 数字 → 判断代价 → 继续调整
```

页面首屏给出轻量建议：“建议先调采样率，观察空间细节和数据量变化。”采样、相位、颜色表示、位深、视图、像素检查和计算器都可以独立探索；原理说明和格式边界也不再按四步锁定。

## 固定预算和反馈

每次实验建立一个 baseline：使用当前源图与初始情境参数生成的模型。固定教学预算为：

```text
budgetBits = floor(baseline.rawPayload.bits × 25%)
```

预算不可编辑。页面同时显示 baseline、current、delta、采样像素数、变化像素数、平均 RGB 颜色差异和预算状态。delta 始终是 `current - baseline`；变化像素数沿用模型中“当前重建图与源图颜色不同的像素数”定义。

这里的位数和字节是理论原始像素数据量，不是 PNG、JPEG 或 WebP 的实际文件大小。格式实际大小仍取决于图像内容、编码器设置、文件头、元数据和具体实现。

页面展示原图、重建图、理论数据量和平均 RGB 颜色差异。改变采样率、颜色表示、位深或相位后，页面更新当前结果。

操作后反馈使用当前模型的真实结果。视觉比较仍保持源图与重建图的同尺寸坐标关系。

## 实现约束

- `deriveImageEncodingModel` 保持确定性采样、量化、重建和误差计算。
- `summarizeImageEncodingModel` 只读取已有模型字段，不重新采样、量化或重建。
- 页面只在一个位置派生 current model；baseline 只依赖 source 和 initial config。
- summary、delta、预算和语义判断都从已有 current / baseline model 派生。
- RGB24 下位深不适用；完整采样密度下相位继续规范化为 0。
- reducer 保留 `samplingChanged`、`colorAdjusted`、`calculatorEdited` 及原有 action/reset/load/decode-error 语义。这些字段是兼容状态，不再作为 UI 解锁信号。
- 上传成功重置实验；上传失败保留当前实验。URL 只保存可复现实验参数，不保存进度。

## 样例和性能边界

内置图像为项目内生成的小型 RGB 栅格，不依赖远程资源。上传图像仍限制工作栅格最大边长 96，降低重建和像素检查的成本；如未来图像尺寸扩大，再基于 profiling 单独评估节流或 worker。
