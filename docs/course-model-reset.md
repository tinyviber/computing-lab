# Computing Lab Course Model Reset

状态：课程模型与 minimal framework 已冻结；PR #9 已在 children-only shell 下实现 Sound reference implementation。本文件记录教学模型与边界，不规定 shared lesson UI。

## 结论先行

当前问题不是 shared component 不够多，而是教学模型被既有组件反向规定。`LabShell`、`VisualizationPanel`、`ParameterControl`、`FormulaPanel`、`ExperimentStatus` 以及 `ready/editing/success/failure`、`step`、`submit` 等概念先于课程存在，导致三门课被压成同一个 inspector dashboard。

本轮反转顺序后的结论：

- 图像编码是静态的、连续探索的 source → sampling/quantization → representation/reconstruction 问题；没有天然的全局 success/failure。
- 声音编码是带时间的试听与对照问题；playback、scrub、loop、original/reconstructed A/B、aliasing、quantization noise 都是核心，不是 slider 的附属物。
- 家庭网络是 topology、per-device configuration、packet/probe path 与 fault diagnosis 问题；“网关文本框 + submit”不是课程模型。
- 三课没有共同的 lesson workflow。没有共同的 phase、step、submit、clock、status、formula、panel 或 action union。
- app 仍需要 route chrome、catalog navigation、accessibility、route error isolation，以及不解释 feature 语义的 opaque URL transport。
- lesson runtime 与全部课程布局归 feature。`LabShell` 若保留，只保留 app shell；其 workspace API 应收敛为 opaque `children`。
- 本轮先实现声音编码作为 framework boundary test；家庭网络随后验证事件驱动诊断；图像编码最后重做，因为当前实现受人工 workflow 污染最深。

本结论由三份彼此独立的课程设计、一次 framework extraction、两轮 adversarial rework 与删除/反施加测试得出；PR #9 进一步用 Sound 的真实 playback、scrub、A/B、sampling 与 quantization 行为验证了边界。

## 1. 三门课模型

### 1.1 图像编码

#### 学生必须理解的因果关系

图像编码在“可表示的数据量”和“重建图像保真度”之间取舍：

```text
source image / source pixels
  → spatial sampling
  → color quantization / palette indexing
  → encoded representation
  → reconstructed image + visible loss
```

- sampling density 决定保留多少空间细节；过低会丢失边缘、纹理，可能产生 spatial aliasing。
- palette depth / quantization 精度决定颜色可表达的离散等级；过低会产生色带、色块与颜色误差。
- encoded representation 不是原图：学生应能看到 sampled pixel matrix、palette、pixel indices、bit allocation，而不只是看到“变差后的图”。
- 信息损失发生在 sampling 与 quantization；reconstruction 通常不能恢复 source。

#### State / action / derived model

| 层次                     | 图像模型                                                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source / input           | 原始图片、照片/渐变/棋盘格/细线等特征、source pixel matrix、图像尺寸、颜色值、选定区域                                                                                                       |
| Encoding / configuration | sampling density、sampling grid phase/position、颜色模式、palette size / bits per pixel、固定数据预算、当前观察视图                                                                          |
| Derived result           | sampled pixel matrix、palette、pixel indices、bit/byte estimate、reconstruction、error map、空间/颜色信息损失                                                                                |
| Natural state            | source view、sampling reconstruction、quantized reconstruction、joint reconstruction、representation compare、error compare；这些是表示/观察视角，不是 workflow phase                        |
| Natural actions          | 选择 source/feature、调整 sampling、移动 sampling grid、调整 palette/bit depth、编辑小型 source pixel、切换 source/reconstruction/error/index/palette view、锁定预算、可选 prediction/reveal |
| Continuous               | sampling、palette、grid phase、zoom/pan、实时观察 reconstruction/error/data cost                                                                                                             |
| Discrete                 | 选择 source、切换 view/mode、显示 encoded representation、锁定比较结果、可选局部 prediction/reveal                                                                                           |
| Time                     | 静态图像本身无必要时间维度；逐位传输/逐步重建只能是可选观察视图，不是主模型                                                                                                                  |
| Correctness              | 无全局正确配置。只判断局部可检验断言：哪个细节消失、哪里出现 banding、给定预算下保留了什么、数据量计算是否正确                                                                               |

#### 是否需要 step / progress / submit

不需要固定 step、progress 或 submit。学生可以先观察颜色、先观察空间采样、反复比较，学习路径不是线性的。

局部 prediction/reveal 练习可以有局部提交，但不是课程主循环。以下设计人工：

- `ready → editing → submit → success/failure`
- 计时器、生命值、强制解锁 next step
- 把某个 density/bits profile 定义为唯一正确答案
- 每次拖动后要求提交

#### Interaction trajectories

1. **照片与空间采样**：进入高分辨率照片 → 降低 sampling density → 放大边缘/纹理 → 对照 error map → 理解空间细节取决于采样数量。
2. **棋盘格与采样相位**：选择细棋盘格 → 保持低 density → 移动 sampling grid → 图案出现、消失或变形 → 理解 aliasing 不只是“整体变模糊”。
3. **渐变与颜色量化**：选择平滑渐变 → 减少 palette levels → 观察 banding → 打开 palette/index view → 理解颜色量化造成离散跳变。
4. **固定预算取舍**：锁定 bit budget → 比较高 sampling/少颜色与低 sampling/多颜色 → 在照片、文字、渐变上观察 → 理解配置取决于目标特征。
5. **源像素追踪**：编辑小型 source pixel → 降低 sampling 或 palette → 追踪像素如何被合并/替换/丢失 → 区分 source pixel、encoded representation、reconstructed pixel。

#### Scenario URL

重做后的 Image feature 已落地一个可复现、但不保存通用 workflow 状态的 scenario contract。`image` 选择内置材料，`sample` 是每轴空间采样百分比，`phase` 是采样网格相位，`bits` 是 indexed palette index width，`view` 只选择观察证据。`phase` 的 canonical value 由内置 fixture 的 rounded sampled geometry 决定：两轴都已达到 source density 时为 `0`；只有一个轴达到 density 时，另一个轴仍可使用 phase。上传的 bitmap、选中像素、hover/focus 和 decode 错误不进入 URL。

```text
/labs/image-encoding?image=checkerboard&sample=25&phase=0.5&bits=2&view=compare
/labs/image-encoding?image=gradient&sample=50&bits=2&view=quantization
/labs/image-encoding?image=photo&sample=25&bits=8&view=error
/labs/image-encoding?image=text-edge&sample=40&phase=0.25&view=sampling
/labs/image-encoding?image=pixel-grid&sample=100&bits=4&view=representation
```

首版不把 `budget`、`palette`、`compare`、`edit` 伪装成已实现的通用状态；预算和 source 编辑保留为后续 feature-local 研究，不引入 universal workflow。

### 1.2 声音编码

#### 学生必须理解的因果关系

声音编码不是“把声音变成一个数字”，而是对随时间连续变化的信号定时测量，再映射到有限振幅等级并重建播放：

```text
continuous signal x(t)
  → samples x(nTs)
  → finite quantization levels
  → reconstructed signal
  → playback / audible comparison
```

- sample rate 不足会错误解释时间变化，造成 aliasing。
- bit depth 不足会减少振幅等级，造成 quantization error/noise。
- original 与 reconstructed 不同；学生必须既看见也听见差异。
- playback speed、sample rate interpretation、reconstruction rule 不能混为一谈。

#### State / action / derived model

| 层次                     | 声音模型                                                                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source / input           | 连续参考信号、纯音/复合音/短脉冲/语音、频率、波形、时长、幅度                                                                                                                                      |
| Encoding / configuration | sample rate、bit depth、sample phase、声道、reconstruction/playback interpretation、source/reconstructed mode、loop/window                                                                         |
| Derived result           | sample sequence、quantized levels、quantization error、reconstructed waveform、file-size estimate、audible aliasing/noise/distortion、当前时间点对应的连续值/采样值/量化值                         |
| Natural state            | listening original、viewing samples、listening reconstructed、hearing aliasing、hearing quantization noise、synchronized comparison、local time tracking；状态由试听与观察产生，不是 ready/editing |
| Natural actions          | play、pause、replay、scrub、loop、原声/重建声切换、同步 A/B、局部 zoom、调整 rate/depth/phase、选择 sound source、可选 capture simulation、预测并解释                                              |
| Continuous               | playback time、scrub、zoom、sample phase、实时 waveform/sample/reconstruction/error 对照                                                                                                           |
| Discrete                 | play/pause/replay、切换 source、生成新编码、开始/结束 capture、选择 source、进入 aliasing/quantization challenge、提交局部解释                                                                     |
| Time                     | 必需。播放头、同步 A/B、局部 loop、暂停、重播、scrub；没有真实时间就无法理解 sample 与声音的关系                                                                                                   |
| Correctness              | 无单一全局答案。可检查 Nyquist 预测、aliasing vs quantization noise 的归因、bit depth 对 error 的影响、预测—试听—解释是否一致                                                                      |

#### 是否需要 step / progress / submit

不需要传统线性 step 或 progress。连续调参、试听、scrub、A/B 不应每次 submit。

submit 只在局部 checkpoint 有意义，例如“预测降低 sample rate 会发生什么”“判断是 aliasing 还是 quantization noise”“用波形证据解释”。课程完成应来自成功解释若干案例，不是点完所有控件。

#### Interaction trajectories

1. **从看不出差异到理解 sample rate**：播放 440 Hz original → 用高 rate 对照 → 降到低 rate → 看 sample points 变稀 → 播放 reconstructed → 听到音高/音色变化 → scrub 一个周期 → 解释时间细节受 sample rate 限制。
2. **区分 aliasing 与 quantization noise**：选择含高频成分的 source → 保持高 bit depth、降低 rate → 听到错误音高/音色 → 恢复 rate、降低 bit depth → 听到颗粒感 → 对照 waveform 与参数，建立二者因果差异。
3. **视觉相似不等于听觉相同**：看 original/reconstructed 叠加 → 认为“线差不多所以一样” → 开同步 loop → 切换高频局部 → 听到差异 → 放大 samples/levels → 理解显示尺度会隐藏误差。
4. **sample phase 探索**：固定 rate/depth → 拖动 phase → 看 sample positions 变化 → 观察 reconstruction 轻微变化 → 认识采样时刻影响有限样本，但不改变原始频率。
5. **录制式模拟**：开始 capture simulation → 实时显示连续输入与 sample points → 停止 → A/B 播放 original/reconstructed → 改参数重采集 → 比较 size、失真、听感，形成 input → encode → playback 因果链。

#### Scenario URL

以下是重做后的 target scenario contract，用于教师分享有意义的声音情境。Sound reference implementation 已落地这组 canonical keys；parser 的完整边界与 legacy 兼容规则在 `src/features/audio-encoding/lesson/scenario.ts` 及其测试中定义。loop 使用 `off`、`on` 或 `startMs,endMs`，view 使用 `compare`、`samples`、`levels`、`error`。

```text
/labs/audio-encoding?source=pure440&sampleRate=2000&bitDepth=16&mode=compare
/labs/audio-encoding?source=high-pulse&sampleRate=8000&bitDepth=16&mode=aliasing
/labs/audio-encoding?source=speech&sampleRate=16000&bitDepth=3&mode=quantization
/labs/audio-encoding?source=sawtooth&sampleRate=44100&bitDepth=2&loop=on
/labs/audio-encoding?source=pure440&sampleRate=8000&bitDepth=8&phase=0.37&view=error
```

不要使用 `step=3&status=active` 这类无法表达声音场景的 URL。

### 1.3 家庭网络配置

#### 学生必须理解的因果关系

家庭网络连通性不是“填写正确网关”单独决定的，而是一条可验证因果链：

```text
connect / associate
  → obtain legal, unique address
  → decide local subnet vs remote target
  → use default gateway when needed
  → route / NAT / policy
  → target response or first failing hop
```

故障诊断目标是找到 packet 第一次无法继续的位置，而不是反复修改字段直到 submit 变绿。

#### State / action / derived model

| 层次            | 网络模型                                                                                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario input  | router、switch/port、Wi-Fi/SSID、computer、phone、printer、NAS、internet target、访问目标、预置 fault                                                                                          |
| Configuration   | topology links、DHCP/static、IP、prefix、gateway、DNS、router LAN、DHCP pool、NAT、guest isolation、access rules                                                                               |
| Derived result  | DHCP leases、address table、ARP resolution、route choice、NAT mapping、packet/probe path、ping/traceroute/DNS result、first failing hop、fault location                                        |
| Natural state   | disconnected/unassociated；link up but no lease；invalid/conflicting address；ARP unresolved；local target reachable；gateway reached but cannot forward；policy blocked；end-to-end reachable |
| Natural actions | 拖接/拔线、选择 port/SSID、开 DHCP/static、改 per-device config、改 router config、renew lease、clear ARP、ping、traceroute、DNS query、持续 probe、inject/repair fault、推进模拟时间          |
| Continuous      | topology/config/observation changes、continuous ping、沿路径查看 packet 当前 hop/header/decision                                                                                               |
| Discrete        | connect/disconnect、apply config、renew、clear ARP、send probe、toggle DHCP/NAT/isolation、inject/repair fault、advance time                                                                   |
| Time            | 必需但由 feature 自己拥有：DHCP lease obtain/renew/expire、ARP cache、duplicate-IP intermittent ping、recovery after old cache                                                                 |
| Correctness     | 由 scenario goal + observed behavior + path 决定；允许多种合法配置。可达、隔离、地址合法/唯一、故障点判断都可成为局部 predicate                                                                |

#### 是否需要 step / progress / submit

不需要强制 step/progress。网络本来就是修改、测试、比较、回退。

可有轻量目标，例如“让 printer 可达，同时保留 guest isolation”，但不锁定顺序。submit 只在 fault-location + explanation challenge 中有意义；不是全局 gateway check。

以下设计人工：单个 gateway 输入框、把 packet path 做成纯动画、唯一标准配置、通用 submit-success/failure workflow。

#### Interaction trajectories

1. **首次安装家庭网络**：连接 router、computer、phone → 开 DHCP → renew leases → ping LAN target → ping internet target → 看 local traffic 直达、remote traffic 经过 gateway/NAT。
2. **静态 printer 无法访问**：发现 printer 在线但 ping 不通 → 查看 per-device IP/prefix → 找到错误网段 → 修正 prefix 或切换 DHCP reservation → 再 probe，定位第一失败点。
3. **偶发断网与 duplicate IP**：把 laptop 静态设到 DHCP pool 已占用地址 → continuous ping → 观察 ARP/MAC 与结果交替 → 查看 lease/address table → 改用唯一地址并验证恢复。
4. **guest Wi-Fi 与 NAS**：手机加入 guest SSID → 获得地址并访问 internet → 访问 NAS 在 isolation policy 被阻断 → 区分“没连通”“没路由”“策略禁止”。
5. **DHCP outage**：多台设备 link up 但无 lease → 查看 DHCP 开关与 pool/lease table → 修复 pool 或释放 lease → renew 并验证设备路径。

#### Scenario URL

以下是重做后的 target scenario contract，用于教师分享完整网络情境，不传“正确答案”字段。它们不是当前 parser 已支持的完整 query contract；当前实现主要支持有限的 `scenario`/gateway keys。拓扑、fault、target 等语义需在 Network 重做时由 feature parser 明确定义。

```text
/labs/home-network?scenario=first-home-setup
/labs/home-network?scenario=static-printer&fault=wrong-prefix
/labs/home-network?scenario=intermittent-connection&fault=duplicate-ip
/labs/home-network?scenario=guest-wifi&fault=blocked-by-isolation
/labs/home-network?scenario=dhcp-outage&fault=pool-exhausted
```

## 2. Capability matrix 与 minimal common envelope

### 2.1 Capability matrix

| Capability                                               | Owner        | 删除测试                                              | 最终 disposition                                                             | 三课真实证据                                                                                                                             |
| -------------------------------------------------------- | ------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Opaque route-search transport                            | app/router   | 删除后 deep link、history、share link 消失            | 保留为 app-only；当前读取/透传，未来可选 opaque write；app 不解释 query keys | image 传 image/config/view；sound 传 source/rate/bits/mode；network 传 topology/config/fault/target                                      |
| Catalog navigation                                       | app          | 三课仍可直达，但产品导航退化                          | 保留为 app infrastructure                                                    | 三课都需要从 catalog 进入，不属于教学语义                                                                                                |
| Route chrome                                             | app          | 三课教学仍可运行，但品牌/上下文消失                   | 保留为 app infrastructure                                                    | title/context/header 对三课都非课程因果                                                                                                  |
| Accessibility/navigation behavior                        | app          | 课程语义不变，但产品可用性退化                        | 保留为 app infrastructure                                                    | landmarks、responsive menu、focus return、Escape、inert 与课程无关但 app 必需                                                            |
| Route error isolation                                    | app          | 单路由故障可能破坏整个 app                            | 保留在 app boundary                                                          | 三课都受益，非 lesson runtime                                                                                                            |
| Opaque children-only mount                               | app shell    | 三课可直接在 route 中 compose；并非 lesson capability | 保留为 app route composition boundary；不定义 lesson API                     | image 需要任意 source/reconstruction/error/control composition；sound 需要 waveform/transport/A-B；network 需要 topology/probe/diagnosis |
| Scenario schema/init                                     | feature      | 每课可独立 parse/default/preset/init                  | 不进入 framework                                                             | 三课 schema、变量、故障模型完全不同                                                                                                      |
| State/action/derived/validation                          | feature      | 每课已有本地模型，删除 shared contract 不损失行为     | 不进入 framework；保留 ownership rule                                        | image matrix/palette/error；sound playback/reconstruction；network leases/routes/probes                                                  |
| Continuous/discrete event delivery                       | feature      | local callbacks/reducers 足够                         | 不进入 framework；不建 event bus                                             | sound clock/playback、network simulation timing、image controls 各自不同                                                                 |
| Clock/time engine                                        | feature      | image 不需要，sound/network 需求不同                  | 不进入 framework                                                             | sound playback time；network lease/ARP/probe time；image static                                                                          |
| Reset                                                    | feature      | 三课 reset 语义不同                                   | 不进入 framework；可为 feature-local action                                  | image restore exploration baseline；sound reset/replay；network renew/clear/recovery                                                     |
| Checkpoint/submit                                        | feature      | 三课都可无全局 submit                                 | 不进入 framework；局部 checkpoint feature-owned                              | image optional prediction；sound explanation；network fault-location                                                                     |
| Layout                                                   | feature      | 三课可各自完整 render                                 | 不进入 framework                                                             | image compare/error；sound transport/waveform；network topology/path                                                                     |
| Shared status/notice semantics                           | none         | 三课都能 local render                                 | 删除 shared semantics；必要时 feature-local neutral notice                   | 三课 status meaning 不同，不能由 phase 推断                                                                                              |
| FormulaPanel                                             | none/feature | image/sound 可自绘，network 不是 formula              | 不进入 framework；feature-owned notation/diagnostics                         | 只有 image/sound 有部分公式，network 是 path/issue evidence                                                                              |
| ParameterControl                                         | none/feature | sliders 可在 feature 自绘                             | 仅 local convenience                                                         | image/sound 当前使用 numeric sliders，network 不使用                                                                                     |
| VisualizationPanel                                       | none/feature | 三课可各自 render workspace                           | 不进入 framework；可局部 styling helper                                      | current shared card 只是视觉相似，不是行为交集                                                                                           |
| Fixed `visualization/controls/explanation/actions` slots | none         | 删除后三课更自然                                      | 删除                                                                         | 三课布局顺序、并置关系、交互密度均不同                                                                                                   |
| Event bus                                                | none         | local event handlers 足够                             | 删除                                                                         | 无真实跨课 event subscription 需求                                                                                                       |
| Shared state/action/derived contract                     | none         | 三课 model 各自表达                                   | 删除                                                                         | 三课 causal graph 不同                                                                                                                   |
| Host scenario schema                                     | none         | feature parsers 可独立工作                            | 删除                                                                         | app 只传 opaque URL values                                                                                                               |
| Universal phase/workflow                                 | none         | 不影响任何自然课程轨迹                                | 删除                                                                         | image 无 global correctness；sound/time states；network causal fault states                                                              |

### 2.2 Minimal framework

严格意义上，course framework 不包含 lesson semantics。最小边界为：

```text
app route
  → optional app-owned AppShell/LabShell
  → one unconstrained children node
```

`AppShell`/保留名称的 `LabShell` 概念 API 仅可包含：

- app route metadata：title、subtitle、context；
- app catalog/navigation context；
- opaque `children`。

不得包含：

- `visualization`、`controls`、`explanation`、`actions` slots；
- feature workflow `navigation`；
- `phase`、`step`、`scenario`、`state`、`dispatch`、`clock`、`validation`、`reset`、`submit`；
- feature-owned workspace 的固定 columns、panels、rails、workspace ordering（app catalog rail 不在此列）；
- host-owned event bus、clock、state/action union、scenario schema。

Feature children 内部可自由拥有 canvas、split view、overlay、timeline、form、diagnostics、transport、probe path 与各自 responsive layout。

### 2.3 明确不进入 framework 的清单

以下概念从 framework 删除，或降级为 feature-local helper：

- `phase`
- `ready` / `editing` / `success` / `failure`
- `step` / progress
- `submit`
- `retry`
- `next-step`
- `FormulaPanel`
- `ExperimentStatus` semantic behavior 与 `ExperimentPhase`
- `ParameterControl`
- `VisualizationPanel`
- 固定 `visualization` / `controls` / `explanation` / `actions` slots
- event bus
- shared clock/time engine
- shared state/action/derived contract
- host scenario schema
- generic scenario initialization
- generic validation
- generic reset semantics
- generic checkpoint semantics
- feature workflow navigation

如果仍需 notice，它必须是 semantic-neutral、optional、feature-local；feature 提供 content 与 severity，shared code 不得从 phase 推断 icon、alert、success 或 failure。

## 3. Adversarial evaluator 结果

### 3.1 Capability deletion test

逐项删除 proposed capability 后的结论：

- 删除 generic event delivery：三课仍可用 feature-local callbacks/reducers；删除。
- 删除 scenario initialization：三课各自 parse/default/preset/init；从 framework 删除。
- 删除 children-only mount：课程仍可直接由 route compose；它不是 lesson capability，只是可选 app route composition boundary。
- 删除 opaque URL transport：课程语义仍成立，但 deep links、history、share links 退化；保留在 app/router，且 opaque。
- 删除 app chrome/navigation/accessibility/error isolation：课程语义仍成立，但产品集成与容错退化；保留在 app boundary。
- 删除 universal phase/status/workflow：三课都能更自然表达；删除。
- 删除 shared FormulaPanel/ParameterControl/VisualizationPanel：三课可自绘；从 framework 删除，可按 feature 需要保留局部 helper。
- 删除 shared clock/state/action/derived/validation/reset/checkpoint：三课行为不受损；全部 feature-owned。

### 3.2 Framework reapplication test

将剩余 app boundary 施加回三课，不产生人工教学概念：

- Image 保留 source/sampling/quantization/reconstruction/error 的连续探索，不得到 host phase/step/submit/panel。
- Sound 保留 feature-local time/playback/scrub/loop/A-B，不得到 host clock 或 playback contract。
- Network 保留 feature-local topology/per-device config/packet path/probe/fault timing，不得到 host workflow 或 scenario schema。
- App chrome 只提供 catalog navigation、main landmark、responsive navigation；route error isolation 属于 app/router boundary，`LabShell` 只在其内渲染。
- URL 由 app/router opaque 读取/透传，未来可选 write；当前实现没有 live write contract。feature 决定 query 含义与 serialization。
- `children` 不被 shell inspect 或 arrange；不存在固定 region。

删除/反施加结论：没有剩余 shared lesson semantics；下一阶段实现必须保持上述 app/feature 边界。

## 4. 当前实现审查

### 4.1 真正成立、应保留的 abstraction

- `domain → lesson → ui` dependency direction：domain 放纯事实/计算，lesson 放 feature state/scenario transitions，ui 放 feature composition。
- feature-owned pure calculations 与 derived models。
- feature-owned scenario parsing、defaults、presets 与 normalization。
- `LabNavigationProvider` 提供 app catalog/navigation context。
- `LabShell` 当前的 app-level responsive navigation behavior：catalog links、active route、mobile menu、focus restoration、Escape、scrim、inert。
- route-level `LabErrorPage` / error isolation。

这些是 app 或 feature boundary，不是 shared lesson workflow。

### 4.2 过早抽象

- `ExperimentPhase = "ready" | "editing" | "success" | "failure"`：把三课不同 causal state 压成同一 vocabulary。
- `LabShell` named slots 与固定 `1fr / 400px` workspace：把布局相似误当作运行时能力。
- shared `ParameterControl`：目前 image/audio 共用 integer slider，network 不用；是局部控件便利，不是 course capability。
- shared `FormulaPanel`：image/audio 有部分公式，network 需要 diagnostic/path evidence；名称与语义不覆盖三课。
- shared `VisualizationPanel`：三课当前都放在 card，但 sound 需要 time transport，network 需要 topology/probe，视觉 card 不构成模型交集。
- image `WorkflowRail`：只服务人工四步流程，不是课程自然状态。
- `initialDensity` / `initialBits` / `initialOptions` / `initialGateway`：有效的 feature implementation detail，不应提升为 shared runtime state。

### 4.3 应删除或降级

- image 的 `run-preview → submit → success/failure → retry → next-step` path。
- shared `ExperimentPhase` export 与 phase-derived icon/alert behavior。
- `LabShell` 的 `visualization`、`controls`、`explanation`、`actions` props。
- `LabShell` 的 feature workflow `navigation` injection。
- `LabShell` 的 fixed workspace grid 与 shell-owned explanation/action placement。
- shared `FormulaPanel`、`ParameterControl`、`VisualizationPanel` framework status；按需移回 feature。
- shared `ExperimentStatus` semantic behavior；按需移回 feature或改为 neutral local notice。
- 相关旧测试中对 fixed slots、phase、step、submit、retry、next-step 的断言；迁移时改为课程模型行为测试。

## 5. LabShell responsibility boundary

### LabShell 应保留

- product branding；
- route-level title/subtitle/context；
- catalog navigation 与 active-route handling；
- responsive navigation、mobile menu、focus restoration、Escape、scrim、inert；
- app-level `header` / `main` landmark；
- route-level error isolation 由 app router/error boundary 承担；`LabShell` 只在该边界内渲染，不拥有 error boundary。

### LabShell 不应再负责

- feature workspace geometry；
- visualization/control/explanation/action order；
- inspector panel、formula panel、status area；
- workflow rail、step/progress；
- playback transport、scrubber、network probe timeline、topology canvas；
- feature-specific status/diagnosis；
- feature-specific responsive layout。

当前 feature pages 直接向 `LabShell` 传入 title/subtitle/eyebrow 等 route chrome metadata；这些是 composition inputs，不是 lesson state。未来可由 app catalog/router 集中提供，但不应进入 shared lesson runtime。

当前 catalog navigation 由 `LabNavigationProvider` 在 `LabShell` 内部生成；`navigation` prop 则额外注入 feature content（当前是 image local workflow rail）到 app rail。后者不应再进入 shell；catalog navigation 继续留在 app。

## 6. Migration inventory（下一阶段实现时使用）

1. 将 `LabShell` named slots 改为 opaque `children`；移除 fixed workspace grid。
2. 保留 catalog、chrome、responsive navigation、accessibility、route error isolation。
3. 移除 feature workflow 从 shell rail 注入。
4. 从 shared exports 移除 `ExperimentPhase` 与 phase-derived semantics。
5. 将 status/notice 变成 feature-local；如需共享，只保留 semantic-neutral primitive。
6. 将 formula/diagnostic rendering 归还各 feature。
7. 将 numeric controls 与 visualization styling 视为 local convenience，不纳入 framework contract。
8. 保留 feature reducers、domain calculations、scenario ownership。
9. 保持 app query transport opaque；每课实现自己的 serializer，明确是否序列化 transient state。
10. 不新增 shared event bus、clock、state/action union、validation、reset 或 scenario schema。
11. 重分类旧测试：保留 app boundary/accessibility/router coverage；删除或重写固定 slots 与人工 workflow 断言。
12. 先重做 Sound，再用 Home Network 做第二个 boundary acceptance；Image 最后迁移。

## 7. Reference implementation decision

本轮先实现 **声音编码**。

原因不是声音与其他课 UI 更像，而是它最能暴露错误 framework：

- 必须有 feature-local playback time；
- 必须支持 play/pause/replay/scrub/loop；
- 必须同步 original/reconstructed A/B；
- 参数改变同时影响 samples、quantization、waveform 与听感；
- continuous exploration 不能被 submit 切碎；
- 可有 checkpoint，但不能成为全局 workflow；
- app shell 不应提供 clock、transport、status phase 或固定 controls/visualization regions。

Sound 已在 children-only app shell 中以 feature-owned playback、time window、scrub、A/B audition、component aliasing 与 quantization evidence 成立，未复活 image-style inspector workflow。下一步用 Home Network 验证 lease/ARP/probe/fault/recovery 事件与多合法配置。Image 最后迁移，因为它当前 `step`/`submit`/`success/failure` 污染最大。

## 8. Open questions（不阻塞本轮冻结）

- URL 是否只在显式点击 share 时写回，还是对可重现 configuration 做 replaceState？
- URL 是否保存 playback cursor、probe history、ARP cache 这类 transient state？默认不保存，除非课程证明其教学价值。
- Sound 与 Network 的 clock 是否完全 feature-local，或 feature 内部是否需要通用 scheduler helper？本轮不提升为 framework。
- reset 对 Sound 的 playback position、对 Network 的 lease/cache/fault 到底意味着什么？由各 feature 定义。
- prediction/diagnosis checkpoint 如何表达多个合法答案？不能复用 binary success/failure。
- scenario URL 是否需要 versioning？若 schema 演化，再由 feature serializer 处理。
- Sound 当前使用 deterministic local domain model 加 feature-owned Web Audio effect；后续课程仍需分别定义自己的 media/simulation 边界。

这些问题会影响 Home Network 与 Image 的后续课程实现，但不会改变本轮 minimal envelope。
