# 二进制补码参考课程：课程设计与实现交接

> **状态：** feature-local 课程已实现；format、lint、typecheck、197 个 Vitest 测试与 production build 通过。Playwright E2E 因本机 Chromium 缺失而未能启动。
> **边界：** 这是第四个 reference course 的 feature-local 设计与实现；不提出或实施 shared primitive extraction。

## 1. 课程问题与最小承诺

课程不是二进制转换器，也不是完整 ALU。它要让高中学生在约 5–10 分钟内能够回答：

> 为什么固定为 4 位时，`0111 + 0001` 的存储结果是 `1000`；为什么无符号可以读作 `8`，二补码却读作 `−8`；以及为什么这一次有 signed overflow 却没有 carry-out？

主路径从一个可复现的边界例子开始：4-bit、`A = 0111`、`B = 0001`、signed two's-complement reading。学生可直接改变任一 operand 的 bit；所有数字与结论都由同一个定宽 model 重新推导。

## 2. 必须存在的概念

- **fixed width / word**：本课保存恰好 4 或 8 个 bit；第 `width + 1` 个 carry 不能进入结果 word。
- **同一个 bit pattern 的两种解释**：同一 `1000` 在 4 bit 下是 unsigned `8`，也是 signed two's-complement `−8`。
- **sign bit 与 signed range**：signed 读法中最高 bit 的权重为 `−2^(width−1)`，故范围是 `−2^(width−1)…2^(width−1)−1`。
- **ripple addition**：每列由两个 input bit 与 carry-in 决定 result bit / carry-out。
- **carry-out 与 signed overflow 的分离**：
  - carry-out 表明无符号和超过 `0…2^width−1`；
  - signed overflow 表明两个同号 two's-complement input 得到异号 result，等价于 sign-bit carry-in 与 carry-out 不同；
  - 二者必须独立显示。

## 3. 有意不塞进主学习路径的内容

不做自由十进制输入/转换器、人工逐位拖 carry、完整二进制减法、乘除法、CPU flags/registers、饱和算术、语言的 32/64-bit 行为、浮点数或可编程 ALU。

**Negation 决策：** domain 会有 `negateBitPattern`（bitwise invert 后由同一 ripple adder 加一）及测试，因为它是二补码的事实；但最小 UI 不加入另一个“负数工作流”或 `NOT/+1` 面板。主课先通过 signed weight、`1111 = −1` 与可编辑 word 建立负数读法，避免把 7–8 分钟课程变成两堂课。可在 explanation/evidence 中简短说明“`1111` 亦是 `−1`；model 可按取反加一得到相反数”，但不把它列为主操作。

## 4. 推荐 interaction 与学习轨迹

1. **设定机器**：在 4-bit/8-bit segment 中选择 word width。初始为 4 bit，旁边始终显示 unsigned 与 signed range。宽度变化不会让 JavaScript 整数自动扩张：lesson 用当前 reading 保持两个 operand 的值，signed 情况 sign-extend，unsigned 情况 zero-extend；超出新的 range 时仍由 word 的低位定义结果。
2. **操纵 word**：A 与 B 的每个 bit 都是键盘可触发的 button，并标示 bit position / current value。点击后立即重算，不存在 submit step。
3. **读同一结果**：signed/unsigned segmented reading 控制 primary sentence，但 result card 同时保留另一种 interpretation，因此切换不会伪装成改变 bits。
4. **观察 computation**：从低位向高位的 ripple trace 显示每列 carry-in、A、B、result；最高列右侧单独保留 carry-out（“width 外、未存入”）。
5. **验证边界**：快捷例子按当前 width 提供 signed-boundary、carry-only 与 negative-overflow：4-bit 分别是 `0111 + 0001`、`1111 + 0001`、`1000 + 1111`；8-bit 分别是 `01111111 + 00000001`、`11111111 + 00000001`、`10000000 + 11111111`。它们不是练习关卡，也不写入 URL。
6. **复位**：恢复 URL 初始 scenario，而不是全局固定 default。

直接 drag carry、十进制 text-input 反推 bits、连续动画和问答评分被排除：它们会增加操作或 assessment 状态，而不能增强这节课要观察的核心计算关系。

## 5. Feature-local domain model

放置：`src/features/twos-complement/domain/model.ts`。

### Entities and transformations

- `WordWidth = 4 | 8`
- `Bit = 0 | 1`
- `BitPattern`：canonical string，长度严格等于 width，只有 `0` / `1`。
- `interpretUnsigned(pattern)`：逐 bit 的定宽 positional weights。
- `interpretSigned(pattern)`：unsigned value 减去 `2^width`（仅最高 bit 为 1 时）；不使用 JS 的无限宽 bitwise arithmetic。
- `bitWeights(width, reading)`：每 bit 的 displayed signed/unsigned weight。
- `addBitPatterns(left, right)`：逐位 ripple-carry algorithm，返回 `result`, `columns`, `carryOut`；column 证据包括 bit position, carry-in, operand bits, result bit, carry-out。
- `negateBitPattern(pattern)`：invert word 后，把 one-word 交给 `addBitPatterns`；全程在 word width 内。
- `deriveIntegerModel({ width, left, right })`：统一产物，含 operands/result interpretations、ranges、addition trace、unsigned mathematical sum/range predicate、signed mathematical sum/range predicate、signed-overflow truth and carry comparison。

### Invariants

- 任何 stored / result pattern 均恰为 `width` bits。
- Addition 的每列只消费 bit 加 carry，`result` 等于把 carry-out 丢弃后的低 `width` 位；它不是 JS `left + right` 的 binary display。
- carry-out = highest-column carry-out；它只陈述 unsigned range。
- signed overflow = operands 的 sign bit 相同且 result sign 不同；并断言它与 `carryIntoSign !== carryOut` 一致。
- signed and unsigned interpretation are views over an unchanged pattern, never a conversion.
- 4/8 bit are model-owned finite widths; normalization rejects/repairs malformed external patterns at the boundary.

## 6. Feature-local lesson state and scenario

放置：`src/features/twos-complement/lesson/{scenario,state}.ts`。

### Serializable scenario

```text
?width=4&a=0111&b=0001&reading=signed
```

- `width`: exact enum `4 | 8`, default `4`.
- `a`, `b`: exact canonical bit strings matching normalized width; invalid/missing words receive the width-specific default (`0111` / `0001` for 4; `00000111` / `00000001` for 8).
- `reading`: `signed | unsigned`, default `signed`.

Canonical serialization always emits the normalized finite width, exact-width lower-case bit words (only digits), and reading; no generic scenario framework, no transient UI state, no preset name. Query parsing is feature-owned.

### Reducer state

```text
{ width, left, right, reading, initialScenario }
```

Actions: `load-scenario`, `set-width`, `toggle-bit` (operand plus MSB-first index), `set-reading`, `apply-example`, `reset`.

Examples are in the local lesson layer and are width-native: at 4 bit, signed-boundary is `0111+0001`, carry-only is `1111+0001`, and negative-overflow is `1000+1111`; at 8 bit, they are `01111111+00000001`, `11111111+00000001`, and `10000000+11111111`. They are local guided entry points, not URL schema.

## 7. UI model

Feature-local files: `ui/TwosComplementPage.tsx`, `ui/twos-complement.css`.

Inside unchanged `LabShell`, use a responsive feature-owned two-column layout:

1. **Course header / question** — “为什么 `0111 + 0001` 会变成 `1000`？” and clear scope.
2. **Machine / controls rail** — width segment, signed/unsigned reading segment, range readout, guided examples, reset.
3. **Operand representation stage** — editable A and B bit buttons with bit-position labels; a per-bit weight strip changing only labels with active reading; both interpretations displayed for each word.
4. **Ripple computation stage** — column grid ordered MSB → LSB visually, with low-to-high direction label; carries, operands, result; a visibly outside carry-out cell.
5. **Interpretation and evidence stage** — `result` word beside simultaneous unsigned/signed readings; two distinct evidence cards:
   - **carry-out** says whether unsigned sum exceeded its finite range;
   - **signed overflow** says whether same-sign input turned into a different-sign result and gives the sign-bit-carry equality evidence.

All bit controls get accessible labels such as `A, bit 3, 0`; reading/width controls use pressed buttons or labeled radios. Evidence is text-first, with color only secondary. Use feature-specific test IDs only for mathematical evidence where role/name is insufficient.

## 8. Tests required before handoff

### Pure domain tests

- Unsigned: 4-bit `0000 = 0`, `1111 = 15`.
- Signed: `0111 = +7`, `1000 = −8`, `1111 = −1`.
- Negation: `0001 → 1111`, `0010 → 1110`.
- Addition: `0011 + 0010 = 0101`; columns preserve ripple carries.
- Critical contrast: `0111 + 0001 = 1000`, `carryOut = 0`, signed overflow true; `1111 + 0001 = 0000`, `carryOut = 1`, signed overflow false; `1000 + 1111 = 0111`, signed overflow true and carry-out true.
- Exhaustively test all 256 ordered 4-bit additions against independent positional arithmetic expectations: low-word truncation, carry-out, signed result, same-sign/different-sign signed-overflow predicate, and equivalence to `carryIntoSign !== carryOut`.
- Width normalization and 8-bit cases; outputs retain exact width and never use host-integer overflow as semantics.

### Lesson / UI tests

- scenario parsing/serialization canonicalizes invalid width / words and direct URL hydration works;
- reducer maintains fixed-width strings when toggling and preserves active reading through width changes;
- page supports choosing width, toggling a bit, switching interpretation, inspecting separate carry/overflow text, applying examples and resetting; it proves no submit/status workflow exists.
- app catalog/router integration recognises public entry only.

### E2E

One path: direct-open the signed overflow scenario → choose 8 then 4 bit → toggle a named bit → observe interpretation → apply signed-boundary example → inspect carry / overflow evidence → Reset → confirm initial word. The E2E asserts the same UI evidence as the domain’s `data-*` model readouts; it never recomputes separately in the test.

## 9. Actual change surface

- Created only `src/features/twos-complement/**` (domain, lesson, UI, tests, CSS).
- Updated only `src/features/twos-complement/index.ts`, `src/app/catalog/labs.ts`, `src/app/router.tsx`, app routing/catalog tests, router integration test, and one feature E2E outside that feature.
- Updated `docs/primitive-extraction-review.md` with the fourth-course retrospective. Shared lesson files, `LabShell`, legacy primitives, app architecture, and existing course feature code remain unchanged.

No `BitGrid`, `BinaryNumber`, `IntegerRuntime`, `ArithmeticRuntime`, `BitVisualizer`, generic scenario codec, generic panel, status or workflow runtime was introduced.
