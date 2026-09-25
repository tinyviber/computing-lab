/**
 * Coach step definitions for the Calculator Lab — the data half of the guide.
 *
 * Each StepDef pairs a predicate (`ready`, optional `done`) with a card
 * builder; the machine in `coach.ts` walks this list to pick the next card.
 * The predicates below are local to the step data; exported pieces are the
 * ones the observer also needs.
 */

import { CALCULATOR_STAGES } from "../domain/stages";
import type { CoachView, StepDef } from "./coach";

const isPin = (kind: string) => kind === "input" || kind === "output";

const pinId = (v: CoachView, name: string, kind: "input" | "output") =>
  v.graph.nodes.find((n) => n.kind === kind && n.name === name)?.id;

const nodeOfKind = (v: CoachView, kind: string) => v.graph.nodes.find((n) => n.kind === kind);

const edgesInto = (v: CoachView, nodeId: string | undefined) =>
  nodeId ? v.graph.edges.filter((e) => e.to.node === nodeId) : [];

const componentNode = (v: CoachView, name: string) =>
  v.graph.nodes.find(
    (n) => n.kind === "component" && n.name?.toLocaleLowerCase() === name.toLocaleLowerCase(),
  );

const submodule = (v: CoachView, name: string) =>
  v.unlockedSubmodules.find((c) => c.name.toLocaleLowerCase() === name.toLocaleLowerCase());

/** Scaffold pins only — the learner has not touched this stage's draft yet. */
const freshDraft = (v: CoachView) =>
  v.graph.edges.length === 0 && v.graph.nodes.every((n) => isPin(n.kind));

export const stageMatches = (stage: StepDef["stage"], stageIndex: number) =>
  stage === undefined || (Array.isArray(stage) ? stage.includes(stageIndex) : stage === stageIndex);

export const stageStartedKey = (stage: number) => `stage-${stage}-started`;

/**
 * The onboarding sequence spans the first two stages, but each stage owns its
 * own copy of the sequence and its own persisted progress. The first few
 * cards are shared because both stages use the same editor gestures. A stage
 * can be revisited independently; passedStages only controls which stages are
 * unlocked, never which tutorial is shown.
 */
const s1Active = (v: CoachView) =>
  (v.stageIndex === 1 || v.stageIndex === 2) &&
  !v.seen.has("s1") &&
  (v.seen.has(stageStartedKey(v.stageIndex)) ||
    // Keep old in-memory callers working while persisted state migrates to
    // stage-scoped keys.
    v.seen.has("s1-started") ||
    freshDraft(v));

/** s1Active, narrowed to one stage. */
const onStage = (v: CoachView, stage: number) => s1Active(v) && v.stageIndex === stage;

/** First output pin on the canvas — "Y" on stage 1, "Sum" on stage 2. */
const firstOutputId = (v: CoachView) => v.graph.nodes.find((n) => n.kind === "output")?.id;

const hasFailure = (v: CoachView) =>
  Boolean(v.runOutcome?.results.some((r) => !r.passed)) ||
  Boolean(v.judgeOutcome && !v.judgeOutcome.passed);

export const STEP_DEFS: StepDef[] = [
  {
    id: "s1-signal",
    group: "onboarding",
    stage: [1, 2],
    ready: s1Active,
    done: (v) =>
      v.observed.toggles >= 1 || v.graph.nodes.some((n) => n.kind === "input" && n.value === 1),
    card: (v) => ({
      title: "先认识信号",
      body: "画布左边是输入，右边是输出。先点一下 A——它可以在 0 和 1 之间切换。",
      focus: pinId(v, "A", "input") ? [{ kind: "node", nodeIds: [pinId(v, "A", "input")!] }] : [],
    }),
  },
  {
    id: "s1-signal-2",
    group: "onboarding",
    stage: [1, 2],
    ready: s1Active,
    card: () => ({
      title: "0 和 1",
      body: "亮起、变色表示这里现在传递的是 1；暗下去表示 0。以后随时可以点输入，自己给电路喂数据。",
      manualLabel: "继续",
    }),
  },
  {
    id: "s1-ports",
    group: "onboarding",
    stage: [1, 2],
    ready: s1Active,
    card: (v) => ({
      title: "端口",
      body: "元件两侧的小圆点是端口：右边的是输出端口，信号从这里出来；左边的是输入端口，信号从这里进去。信号从输出流向输入。",
      focus: [
        {
          kind: "ports",
          ports: [
            ...(pinId(v, "A", "input")
              ? [{ nodeId: pinId(v, "A", "input")!, port: "out", direction: "out" as const }]
              : []),
            ...(firstOutputId(v)
              ? [{ nodeId: firstOutputId(v)!, port: "in", direction: "in" as const }]
              : []),
          ],
        },
      ],
      manualLabel: "继续",
    }),
  },
  {
    id: "s1-wire-start",
    group: "onboarding",
    stage: [1, 2],
    ready: s1Active,
    done: (v) => v.pendingWire != null || v.graph.edges.length >= 1,
    card: (v) => {
      // Stage 1 wires A straight into Y; stage 2 wires A into a pre-placed XOR.
      const targetId = v.stageIndex === 1 ? pinId(v, "Y", "output") : nodeOfKind(v, "xor")?.id;
      return {
        title: "第一根导线",
        body:
          v.stageIndex === 1
            ? "现在把 A 接到 Y：先点击 A 右边的输出圆点。"
            : "现在把 A 接到 XOR：先点击 A 右边的输出圆点。",
        focus: [
          ...(pinId(v, "A", "input")
            ? [
                {
                  kind: "ports" as const,
                  ports: [
                    { nodeId: pinId(v, "A", "input")!, port: "out", direction: "out" as const },
                  ],
                },
              ]
            : []),
          ...(targetId ? [{ kind: "node" as const, nodeIds: [targetId] }] : []),
        ],
      };
    },
  },
  {
    id: "s1-wire-end",
    group: "onboarding",
    stage: [1, 2],
    ready: s1Active,
    done: (v) =>
      v.stageIndex === 1
        ? edgesInto(v, pinId(v, "Y", "output")).length >= 1
        : edgesInto(v, nodeOfKind(v, "xor")?.id).length >= 1,
    card: (v) => {
      const targetId = v.stageIndex === 1 ? pinId(v, "Y", "output") : nodeOfKind(v, "xor")?.id;
      return {
        title: "完成连接",
        body:
          v.stageIndex === 1
            ? "导线正在跟着光标。点击 Y 左边的输入圆点，完成连接。（点空了的话，重新点一次 A 的输出圆点。）"
            : "导线正在跟着光标。点击 XOR 左边任意一个输入圆点，完成连接。（点空了的话，重新点一次 A 的输出圆点。）",
        focus: targetId ? [{ kind: "node", nodeIds: [targetId] }] : [],
      };
    },
  },
  {
    id: "s1-wire-play",
    group: "onboarding",
    stage: 1,
    ready: (v) => onStage(v, 1),
    done: (v) =>
      v.observed.toggles - (v.baselines.togglesAtWirePlay ?? Number.MAX_SAFE_INTEGER) >= 1,
    card: () => ({
      title: "电路是活的",
      body: "导线接好了。再点几下 A，看右边的 Y 跟着变——导线会把信号实时送过去。",
      focus: [{ kind: "wires" }],
      skippable: true,
    }),
  },
  {
    id: "s1-wire-submit",
    group: "onboarding",
    stage: 1,
    ready: (v) => onStage(v, 1),
    done: (v) => v.judgeOutcome != null,
    card: () => ({
      title: "正式提交",
      body: "确认 Y 跟着 A 变以后，点「提交」——服务器会检查你的电路是不是真的做对了。",
      focus: [{ kind: "submit" }],
    }),
  },
  {
    id: "wire-pass",
    group: "onboarding",
    stage: 1,
    ready: (v) => v.stageIndex === 1 && Boolean(v.judgeOutcome?.passed),
    card: () => ({
      title: "第一根导线完成",
      body: "你已经学会了编辑器最基本的操作：点输入、连导线、看输出。下一关开始用逻辑门做运算。",
      manualLabel: "去第 2 关",
      nextStage: 2,
    }),
  },
  {
    id: "s1-wire-b",
    group: "onboarding",
    stage: 2,
    ready: (v) => onStage(v, 2),
    done: (v) => edgesInto(v, nodeOfKind(v, "xor")?.id).length >= 2,
    card: (v) => ({
      title: "自己来一根",
      body: "很好。现在试着自己把 B 接到 XOR 的另一个输入。",
      focus: [
        ...(pinId(v, "B", "input")
          ? [
              {
                kind: "ports" as const,
                ports: [
                  { nodeId: pinId(v, "B", "input")!, port: "out", direction: "out" as const },
                ],
              },
            ]
          : []),
        ...(nodeOfKind(v, "xor")
          ? [{ kind: "node" as const, nodeIds: [nodeOfKind(v, "xor")!.id] }]
          : []),
      ],
    }),
  },
  {
    id: "s1-wire-sum",
    group: "onboarding",
    stage: 2,
    ready: (v) => onStage(v, 2),
    done: (v) => {
      const xor = nodeOfKind(v, "xor");
      const sum = pinId(v, "Sum", "output");
      return Boolean(
        xor && sum && v.graph.edges.some((e) => e.from.node === xor.id && e.to.node === sum),
      );
    },
    card: (v) => ({
      title: "送到输出",
      body: "XOR 已经算出了结果，但还没有送到题目要求的 Sum。把 XOR 的输出圆点接到右边的 Sum。",
      focus: [
        ...(nodeOfKind(v, "xor")
          ? [
              {
                kind: "ports" as const,
                ports: [
                  { nodeId: nodeOfKind(v, "xor")!.id, port: "out", direction: "out" as const },
                ],
              },
            ]
          : []),
        ...(pinId(v, "Sum", "output")
          ? [
              {
                kind: "ports" as const,
                ports: [
                  { nodeId: pinId(v, "Sum", "output")!, port: "in", direction: "in" as const },
                ],
              },
            ]
          : []),
      ],
    }),
  },
  {
    id: "s1-explore",
    group: "onboarding",
    stage: 2,
    ready: (v) => onStage(v, 2),
    card: (v) => {
      const combos = ["00", "01", "10", "11"].filter((k) => k in v.observed.combos);
      const complete = combos.length === 4;
      return {
        title: "试一试，找规律",
        body: complete
          ? "这就是 XOR：两个输入不同的时候输出 1。半加器的 Sum 已经完成了。"
          : "分别试试 A/B = 00、01、10、11，观察 Sum 什么时候是 1。",
        rows: combos.map((k) => ({
          label: `A=${k[0]} B=${k[1]}`,
          value: `Sum=${v.observed.combos[k]}`,
        })),
        focus:
          pinId(v, "A", "input") || pinId(v, "B", "input")
            ? [
                {
                  kind: "node",
                  nodeIds: [pinId(v, "A", "input"), pinId(v, "B", "input")].filter(
                    (id): id is string => Boolean(id),
                  ),
                },
              ]
            : [],
        manualLabel: complete ? "继续" : undefined,
        skippable: !complete,
      };
    },
  },
  {
    id: "s1-add-and",
    group: "onboarding",
    stage: 2,
    ready: (v) => onStage(v, 2),
    done: (v) => Boolean(nodeOfKind(v, "and")),
    card: () => ({
      title: "自己放一个元件",
      body: "刚才的 XOR 是替你放好的。接下来由你添加一个 AND：点一下元件区的 AND，它会出现在画布里。",
      focus: [{ kind: "palette-gate", gate: "and" }],
    }),
  },
  {
    id: "s1-drag",
    group: "onboarding",
    stage: 2,
    ready: (v) => onStage(v, 2),
    done: (v) => v.observed.nodeDrags >= 1,
    card: (v) => ({
      title: "摆个顺手的位置",
      body: "元件可以拖动——把 AND 拖到你觉得舒服的位置。",
      focus: nodeOfKind(v, "and") ? [{ kind: "node", nodeIds: [nodeOfKind(v, "and")!.id] }] : [],
    }),
  },
  {
    id: "s1-carry",
    group: "onboarding",
    stage: 2,
    ready: (v) => onStage(v, 2),
    done: (v) => edgesInto(v, pinId(v, "Carry", "output")).length >= 1,
    card: (v) => ({
      title: "完成 Carry",
      body: "Carry 只有 A 和 B 都是 1 时才应该为 1。用刚加入的 AND 完成剩下的连接。",
      focus: pinId(v, "Carry", "output")
        ? [{ kind: "node", nodeIds: [pinId(v, "Carry", "output")!] }]
        : [],
    }),
  },
  {
    id: "s1-delete",
    group: "onboarding",
    stage: 2,
    ready: (v) => onStage(v, 2),
    done: (v) =>
      v.observed.edgeDeletions >= 1 &&
      v.graph.edges.length >= (v.baselines.edgesAtDelete ?? Number.MAX_SAFE_INTEGER),
    card: () => ({
      title: "接错了怎么办",
      body: "直接点击一根导线就能删除它。试着删掉一根导线，再把它接回去。",
      focus: [{ kind: "wires" }],
    }),
  },
  {
    id: "s1-undo",
    group: "onboarding",
    stage: 2,
    ready: (v) => onStage(v, 2),
    card: () => ({
      title: "撤销",
      body: "删错了也没关系：Ctrl/⌘+Z 可以撤销刚才的操作。",
      manualLabel: "知道了",
    }),
  },
  {
    id: "s1-manual-test",
    group: "onboarding",
    stage: 2,
    ready: (v) => onStage(v, 2),
    done: (v) =>
      v.observed.toggles - (v.baselines.togglesAtManualTest ?? Number.MAX_SAFE_INTEGER) >= 2,
    card: (v) => ({
      title: "先自己试",
      body: "电路已经连通。先别急着提交——点 A、B 再试几组输入，看看 Sum 和 Carry 怎么变。",
      focus:
        pinId(v, "A", "input") || pinId(v, "B", "input")
          ? [
              {
                kind: "node",
                nodeIds: [pinId(v, "A", "input"), pinId(v, "B", "input")].filter(
                  (id): id is string => Boolean(id),
                ),
              },
            ]
          : [],
    }),
  },
  {
    id: "s1-public-test",
    group: "onboarding",
    stage: 2,
    ready: (v) => onStage(v, 2),
    done: (v) => v.runOutcome != null,
    card: () => ({
      title: "让系统帮你试",
      body: "自己试只能检查一部分情况。点击「运行公开测试」，系统会替你检查多组输入。",
      focus: [{ kind: "run-tests" }],
    }),
  },
  {
    id: "s1-read-results",
    group: "onboarding",
    stage: 2,
    ready: (v) => onStage(v, 2),
    card: (v) => ({
      title: "看懂结果",
      body: hasFailure(v)
        ? "每一行就是一组输入：期望是题目要求的输出，实际是你的电路给出的结果。没过的行就是反例——先把画布输入拨成和它一样的一组，沿导线看信号走到哪里开始不对。"
        : "每一行就是一组输入：期望是题目要求的输出，实际是你的电路给出的结果。",
      manualLabel: "知道了",
    }),
  },
  {
    id: "s1-submit",
    group: "onboarding",
    stage: 2,
    ready: (v) => onStage(v, 2),
    done: (v) => v.judgeOutcome != null,
    card: () => ({
      title: "正式提交",
      body: "公开测试只是帮你调试。确认后点「提交」：服务器还会用你看不到的输入再检查一遍。",
      focus: [{ kind: "submit" }],
    }),
    alsoMark: ["s1"],
  },
  {
    id: "unlock",
    ready: (v) =>
      Boolean(
        v.judgeOutcome?.passed &&
        v.judgeOutcome.unlockedComponent &&
        !v.seen.has(`unlock-${v.judgeOutcome.unlockedComponent}`),
      ),
    card: (v) => {
      const component = v.judgeOutcome?.unlockedComponent ?? "";
      const next = v.stageIndex + 1;
      return {
        title: "你获得了一个新元件",
        body: `你刚才搭的电路已经变成了新元件 ${component}，就在左边「我的组件」里——以后不用重搭里面的门，直接用它。`,
        focus: [{ kind: "my-components" }],
        manualLabel: next <= CALCULATOR_STAGES.length ? `去第 ${next} 关` : "知道了",
        nextStage: next <= CALCULATOR_STAGES.length ? next : undefined,
      };
    },
  },
  {
    id: "s2-blackbox",
    stage: 3,
    ready: (v) => v.stageIndex === 3 && Boolean(submodule(v, "HalfAdder")),
    done: (v) => Boolean(componentNode(v, "HalfAdder")) || v.graph.edges.length >= 3,
    card: () => ({
      title: "黑盒",
      body: "HalfAdder 里面仍然是你搭的 XOR 和 AND，但现在可以忘掉里面的细节，只关心它的 A、B、Sum、Carry。从左边「我的组件」放一个 HalfAdder 到画布上。",
      focus: [{ kind: "my-components" }],
    }),
  },
  {
    id: "s2-explore",
    stage: 3,
    ready: (v) => v.stageIndex === 3,
    done: (v) => v.graph.edges.length >= 3,
    card: () => ({
      title: "先实验，再设计",
      body: "动手之前先想清楚：拨动下面三个输入，观察 Sum 和 Cout 应该是什么。什么时候 Cout 会变成 1？",
      explorer: "full-adder",
      manualLabel: "想好了，开始搭",
    }),
  },
  {
    id: "s3-bits",
    stage: 4,
    ready: (v) => v.stageIndex === 4,
    done: (v) => v.graph.edges.length >= 4,
    card: () => ({
      title: "一次加 4 位",
      body: "A0 是最低位：先算 A0+B0，它产生的 Cout 会作为下一位的 Cin，进位像波浪一样往高位传。上方「数值读数」会把每组 4 根 1-bit 导线直接读成一个二进制数。",
      focus: [{ kind: "bus-readout" }],
      manualLabel: "继续",
    }),
  },
  {
    id: "s3-cin0",
    stage: 4,
    ready: (v) => v.stageIndex === 4,
    done: (v) =>
      v.graph.edges.some(
        (e) =>
          e.to.port === "Cin" && v.graph.nodes.find((n) => n.id === e.from.node)?.kind === "const",
      ),
    card: () => ({
      title: "最低位的进位",
      body: "最低位没有上一位传来的进位，所以它的 Cin 要接常量 0——元件区里现在能放「常量 0」了。",
      focus: [{ kind: "palette-const", value: 0 }],
    }),
  },
  {
    id: "s4-negation",
    stage: 5,
    ready: (v) => v.stageIndex === 5,
    card: () => ({
      title: "逐位取反，再加 1",
      body: "求 −A 的核心公式是「按位取反 + 1」：先用 NOT 得到 ~A，再用 Add4 加上常量 1。只保留 4 位，最高位溢出的进位不保留。",
      focus: [
        { kind: "palette-gate", gate: "not" },
        { kind: "palette-const", value: 1 },
        { kind: "my-components" },
      ],
      manualLabel: "开始搭建",
    }),
  },
  {
    id: "s5-subtraction",
    stage: 6,
    ready: (v) => v.stageIndex === 6,
    card: () => ({
      title: "把减法改写成加法",
      body: "A − B = A + (−B)。先把 B 接进 Neg4 得到 −B，再把 A 和 −B 的 4 位结果接进 Add4；最后只保留低 4 位。",
      focus: [{ kind: "my-components" }, { kind: "bus-readout" }],
      manualLabel: "开始搭建",
    }),
  },
  {
    id: "s6-partial-products",
    stage: 7,
    ready: (v) => v.stageIndex === 7,
    card: () => ({
      title: "先做部分积",
      body: "乘法可以拆成几行部分积：每个 B 位分别和 A 的 4 位做 AND，B 位为 1 时保留 A，B 位为 0 时整行归零；第 j 行向左移 j 位，再用 FullAdder 累加。",
      focus: [
        { kind: "palette-gate", gate: "and" },
        { kind: "my-components" },
        { kind: "bus-readout" },
      ],
      manualLabel: "开始拆分",
    }),
  },
  {
    id: "s6-componentize",
    stage: 7,
    ready: (v) => v.stageIndex === 7,
    card: () => ({
      title: "会重复的电路，封一次就好",
      body: "这一关会反复用到同一种小电路。在空白处拖动可以框选元件，把选中的部分「封装为自定义组件」，之后就能像 HalfAdder 一样反复使用。",
      manualLabel: "知道了",
    }),
  },
  {
    id: "s7-operation-select",
    stage: 8,
    ready: (v) => v.stageIndex === 8,
    card: () => ({
      title: "先看懂操作选择位",
      body: "Op1、Op0 是两位选择码：00 选加法，01 选减法，10 选乘法，11 选按位 XOR。先分别算出四种结果，再让每一位的选择信号只放行其中一路，这就是 MUX 的思路。",
      rows: [
        { label: "Op1 Op0 = 00", value: "A + B" },
        { label: "Op1 Op0 = 01", value: "A − B" },
        { label: "Op1 Op0 = 10", value: "A × B" },
        { label: "Op1 Op0 = 11", value: "A XOR B" },
      ],
      focus: [{ kind: "my-components" }, { kind: "bus-readout" }],
      manualLabel: "开始选择",
    }),
  },
  {
    id: "s8-bitwise",
    stage: 9,
    ready: (v) => v.stageIndex === 9,
    card: () => ({
      title: "先读懂位运算",
      body: "这一关可以写成按位公式 Y = (~A) & B：~A 把每一位取反，& 要求对应的两位都为 1。这里每个输入只有 1 位，所以它正好对应 NOT 接 AND。",
      rows: [
        { label: "A=0，B=0", value: "~A=1，Y=0" },
        { label: "A=0，B=1", value: "~A=1，Y=1" },
        { label: "A=1，B=0", value: "~A=0，Y=0" },
        { label: "A=1，B=1", value: "~A=0，Y=0" },
      ],
      focus: [
        { kind: "palette-gate", gate: "not" },
        { kind: "palette-gate", gate: "and" },
      ],
      manualLabel: "开始搭建",
    }),
  },
  {
    id: "s9-parity",
    stage: 10,
    ready: (v) => v.stageIndex === 10,
    card: () => ({
      title: "奇偶性就是 XOR 链",
      body: "三个输入中有奇数个 1 时，Y = 1。按位写成 Y = (A ^ B) ^ C：先把 A、B 做 XOR，再把中间结果和 C 做 XOR。",
      focus: [{ kind: "palette-gate", gate: "xor" }],
      manualLabel: "开始搭建",
    }),
  },
  {
    id: "s10-majority",
    stage: 11,
    ready: (v) => v.stageIndex === 11,
    card: () => ({
      title: "至少两个为 1",
      body: "把“至少两个为 1”拆成三个成对条件：Y = (A & B) | (A & C) | (B & C)。先用三个 AND 找出成对同时为 1 的情况，再用 OR 合并。",
      focus: [
        { kind: "palette-gate", gate: "and" },
        { kind: "palette-gate", gate: "or" },
      ],
      manualLabel: "开始搭建",
    }),
  },
  {
    id: "tip-collapse",
    // Component folding is introduced by the multiplication/componentization
    // challenge. A previously created custom component must not leak this tip
    // into earlier stages such as Full Adder.
    stage: 7,
    ready: (v) => v.unlockedSubmodules.some((c) => c.custom),
    card: () => ({
      title: "组件是个黑盒",
      body: "你封装的组件可以当黑盒用：选中后「折叠组件」能把它的连线藏起来，让画布更清爽；想改里面的实现，就用「拆分回去」。",
      manualLabel: "知道了",
    }),
  },
  {
    id: "tip-debug",
    ready: hasFailure,
    card: () => ({
      title: "怎么看反例",
      body: "不用从头猜哪里错了。先看失败的这一组：输入是什么、你的电路给出什么、应该是什么；然后把画布输入拨成同一组，沿着导线看信号从哪里开始不对。",
      manualLabel: "知道了",
    }),
  },
];
