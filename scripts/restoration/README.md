# 图像修复资产管线

这套管线只在制作课程资产时离线运行。课堂页面不下载模型、不调用外部 API，也不实时推理。

## 1. 生成模型输入

输入必须由应用本身的 domain model 生成，不能在图像编辑软件里手工模拟，否则课堂显示的 degraded artifact 与模型实际收到的图会不一致。

```sh
bun scripts/restoration/generate-inputs.ts \
  --output /tmp/computing-lab-restoration \
  --fixtures photo
```

脚本按顺序完成：

1. 枚举 1/8 bit budget 内的离散档位；
2. 用 `checkCore2` 只保留目标区域仍可辨认的组合；
3. 导出量化后的真实小栅格，而不是 CSS 放大的重建图；
4. 串行调用 ffmpeg 写 PNG；
5. 写出 `manifest.json`，其中包含输入尺寸、目标尺寸、模型类型和最终静态资产路径。

可用 `FFMPEG=/path/to/ffmpeg` 覆盖 ffmpeg 路径。

## 2. 超分辨率

使用 Real-ESRGAN NCNN portable v0.2.0，模型 `realesrgan-x4plus`。官方项目：

- https://github.com/xinntao/Real-ESRGAN
- https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan

代码许可证为 BSD-3-Clause；NCNN 实现为 MIT。模型权重随官方 portable 包提供。不要把 executable 或权重提交进本仓库。

每次只处理一张图，并把线程设为 `1:1:1`：

```sh
realesrgan-ncnn-vulkan \
  -i INPUT.png \
  -o OUTPUT.png \
  -n realesrgan-x4plus \
  -s 4 \
  -j 1:1:1 \
  -f png
```

50% 分辨率档用 `-s 2`，25% 和 10% 档用 `-s 4`。10% 档经过 x4 后仍小于原图，再用 ffmpeg 缩放到 manifest 中的目标宽高。不要启用 TTA；它增加资源消耗且不改善本课的可复现性。

## 3. 黑白上色

灰度案例先完成 Real-ESRGAN 超分，再用 DDColor `ddcolor_modelscope` 在目标尺寸上色。官方项目：

- https://github.com/piddnad/DDColor

代码许可证为 Apache-2.0。模型通过 Hugging Face `piddnad/ddcolor_modelscope` 或 ModelScope `damo/cv_ddcolor_image-colorization` 取得；模型权重和缓存不要提交进本仓库。

```sh
python scripts/infer.py \
  --model_name ddcolor_modelscope \
  --input INPUT_DIRECTORY \
  --output OUTPUT_DIRECTORY \
  --input_size 512
```

DDColor 环境应放在仓库之外。不要向模型托管服务上传学生照片；v1 只处理仓库内固定素材。

## 4. 产出与复核

最终图片统一转为 WebP，尺寸必须等于 manifest 的 `outputWidth × outputHeight`，存放到：

```text
public/labs/image-encoding/restored/<image>-<resStop>-<colorStop>.webp
```

每张候选图必须由两人复核：

- AI 输入与 manifest 对应；
- 输出没有损坏，尺寸正确；
- 标出“视觉上合理、输入中却没有证据”的区域；
- 热点坐标写入 `domain/restoration.ts`；
- 不把普通模型伪影误标成可讨论的 hallucination。

只有真实资产和热点都复核完成后，才能加入 `HALLUCINATION_CASES`。当前数组为空是有意的，避免把未经验证的坐标当作答案。

## 5. 当前状态

- 已完成：`photo` 全部 7 个 manifest 条目的 Real-ESRGAN 步骤
  （`realesrgan-x4plus`，`-j 1:1:1`，无 TTA；10% 档 x4 后 Lanczos 缩回
  240×160），输出已转无损 WebP 入库 `public/labs/image-encoding/restored/`，
  并登记在 `RESTORATION_ASSETS`。
- 未完成：两个 gray8 条目的 DDColor 上色步骤（本机暂无 DDColor 环境；
  当前如实展示灰度超分输出，模型字段不冒充已上色）。
- 未完成：§4 的双人复核与幻觉热点标注——`HALLUCINATION_CASES` 保持为空，
  Challenge 2 不出题。
