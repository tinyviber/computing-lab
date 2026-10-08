/**
 * Stage contracts for the audio-encoding lab ("声音编码").
 *
 * The shared frame is a campus radio link: the sender digitizes a sound
 * signal and the receiver only ever hears the *digital* version. Every
 * stage puts the student inside the same workbench — pick a target sample
 * rate, bit depth and channel strategy, run the PCM-style digitization,
 * compare waveforms and listen — then submits a small piece of data:
 *
 *   guided   stage 1: an answer chain about what sampling/quantization mean.
 *   sampling stage 2: a target rate that must fit the wire's budget AND
 *                     stay above the signal's Nyquist wall.
 *   depth    stage 3: a bit depth whose measured quantization noise is
 *                     low enough for the receiver.
 *   design   stage 4: a full {rate, depth, channels} scheme that fits a
 *                     byte budget while still sounding clean.
 *
 * Judged stages run on a per-student fixture signal (see signals.ts); the
 * server regenerates the identical spec from the project owner's id and
 * re-verifies the submitted numbers against it.
 */

import type { AudioParams } from "./audio.ts";

export type AudioStageKind = "guided" | "sampling" | "depth" | "design";

/** One multiple-choice checkpoint inside the guided stage. */
export type AudioPrompt = {
  id: string;
  prompt: string;
  /** Exactly one option is correct; wrong picks may carry a note. */
  options: { label: string; correct?: boolean; note?: string }[];
  /** The recap line shown once answered correctly. */
  reveal: string;
};

export type AudioStageDef = {
  index: number;
  id: string;
  title: string;
  englishTitle: string;
  kind: AudioStageKind;
  /** sampling/design: the wire accepts at most this many samples per second. */
  rateBudgetHz: number | null;
  /** depth/design: measured quantization SNR must reach this, in dB. */
  snrBudgetDb: number | null;
  /** depth/design: the receiver's hardware caps bit depth at this. */
  bitDepthCap: number | null;
  /** design: the whole transmission must fit this many bytes of PCM. */
  byteBudget: number | null;
  guided?: { prompts: AudioPrompt[] };
  /** One-line mission brief: what is being sent and what must survive. */
  mission: string;
  description: string;
  hint: string;
  /** One-line concept recap shown when the stage passes. */
  takeaway: string;
  /** One-click parameter loadouts that surface failure modes — never answers. */
  probes: { label: string; params: AudioParams }[];
};

export const AUDIO_ENCODING_STAGES: AudioStageDef[] = [
  {
    index: 1,
    id: "hear-the-digits",
    title: "听见数字",
    englishTitle: "Hearing the Digits",
    kind: "guided",
    rateBudgetHz: null,
    snrBudgetDb: null,
    bitDepthCap: null,
    byteBudget: null,
    mission: "任务：先认识这套数字化工具——把一段测试音变成数字再变回声音，看清每一步发生了什么。",
    description:
      "工作台已经载入了一段测试音（一个低音加两个泛音）。试着点「开始数字化」、换采样率和位深再处理几次：听处理前后的差别，看波形、采样点和量化阶梯。下面的问答全部答对就能提交。",
    hint: "卡住的问题都可以在工作台上试出来：把采样率调低听混叠，把位深调小看台阶。",
    takeaway:
      "数字化 = 按固定间隔测振幅（采样）+ 把每个值压进有限等级（量化）。采样率定频率上限，位深定精度。",
    guided: {
      prompts: [
        {
          id: "meaning",
          prompt: "测试音以 48000 Hz 采样。这个数字表示什么？",
          options: [
            { label: "每秒钟测量 48000 次声音振幅", correct: true },
            { label: "每秒钟播放 48000 个音符", note: "采样测的是振幅，不是音符。" },
            { label: "每秒钟传输 48000 字节", note: "那是数据量，还要乘位深和声道数。" },
          ],
          reveal: "采样率 = 每秒测量振幅的次数。次数越密，能抓住的变化越快。",
        },
        {
          id: "nyquist",
          prompt: "把采样率降到 8000 Hz，理论上还能正确表示的最高频率是多少？",
          options: [
            { label: "8000 Hz" },
            { label: "4000 Hz", correct: true },
            { label: "16000 Hz", note: "反了——上限是采样率的一半。" },
            { label: "取决于音量大小" },
          ],
          reveal: "奈奎斯特上限 = 采样率 ÷ 2。高于它的分量不会消失，而是被折回低频——这就是混叠。",
        },
        {
          id: "levels",
          prompt: "用 8 bit 量化，每个采样点有多少个可用等级？",
          options: [
            { label: "8 个" },
            { label: "64 个" },
            { label: "256 个", correct: true },
            { label: "65536 个", note: "65536 是 16 bit。" },
          ],
          reveal: "等级数 = 2^位深。8 bit → 256 级；位深每多 1，精度翻倍。",
        },
        {
          id: "datarate",
          prompt: "8000 Hz × 8 bit × 单声道，1 秒钟的 PCM 数据量大约是？",
          options: [
            { label: "8000 字节（≈8 KB）", correct: true },
            { label: "64000 字节（≈64 KB）", note: "8 bit = 1 字节，不用再乘 8。" },
            { label: "1000 字节（≈1 KB）" },
          ],
          reveal: "PCM 大小 = 采样率 × 位深 ÷ 8 × 声道数 × 时长——8000×1×1×1 = 8000 字节。",
        },
        {
          id: "alias",
          prompt: "测试音里有一个 2750 Hz 的泛音。如果用 4000 Hz 采样率去采它，会发生什么？",
          options: [
            { label: "它被正常录下，还是 2750 Hz" },
            {
              label: "它被折回成不属于原信号的假低音（混叠）",
              correct: true,
            },
            { label: "它被完全滤掉，一点声音也没有", note: "能量不会消失，而是折返回来。" },
          ],
          reveal:
            "4000 Hz 采样的奈奎斯特上限只有 2000 Hz：2750 Hz 会被折回成约 1250 Hz 的假音——听感上多出原来没有的音。",
        },
      ],
    },
    probes: [
      {
        label: "原样参考：48000 Hz / 16 bit",
        params: { sampleRate: 48000, bitDepth: 16, channels: 1 },
      },
      {
        label: "对比听感：8000 Hz / 8 bit",
        params: { sampleRate: 8000, bitDepth: 8, channels: 1 },
      },
      { label: "极端：4000 Hz / 4 bit", params: { sampleRate: 4000, bitDepth: 4, channels: 1 } },
    ],
  },
  {
    index: 2,
    id: "thin-wire",
    title: "窄线路",
    englishTitle: "A Thin Wire",
    kind: "sampling",
    rateBudgetHz: 16000,
    snrBudgetDb: null,
    bitDepthCap: null,
    byteBudget: null,
    mission:
      "任务：这条数字线路每秒最多传 16000 个采样点。给你的测试信号选一个采样率——既要装得下，又不能把高频折成假低音。",
    description:
      "你的信号由几个正弦音叠成，最高音的频率只有试了才知道：把采样率从高往低调，听什么时候多出不属于原信号的怪音（混叠），看采样点视图里原波形跟采样点什么时候开始对不上。在线路预算内选一个可行的采样率提交——判定会把它套用到你的信号上验证。",
    hint: "奈奎斯特规则：采样率 ≥ 信号最高频率的两倍。先找出信号的最高音在哪里，再在预算内选。",
    takeaway:
      "采样率不够不是「音质差一点」——高于采样率一半的频率会被折回低频，多出原来根本不存在的音。",
    probes: [
      { label: "16000 Hz（预算上限）", params: { sampleRate: 16000, bitDepth: 16, channels: 1 } },
      { label: "11025 Hz", params: { sampleRate: 11025, bitDepth: 16, channels: 1 } },
      { label: "8000 Hz", params: { sampleRate: 8000, bitDepth: 16, channels: 1 } },
      { label: "4000 Hz", params: { sampleRate: 4000, bitDepth: 16, channels: 1 } },
    ],
  },
  {
    index: 3,
    id: "quiet-floor",
    title: "噪声地板",
    englishTitle: "The Noise Floor",
    kind: "depth",
    rateBudgetHz: null,
    snrBudgetDb: 36,
    bitDepthCap: 12,
    byteBudget: null,
    mission:
      "任务：接收端要求量化噪声足够低——量化信噪比（SNR）达到 36 dB。选一个位深，既要达标又不能超过 12 bit 的器件上限。",
    description:
      "位深决定每个采样点能落在多少个等级上：位数越少，台阶越粗，叠加在声音上的量化噪声越明显。在量化阶梯视图里看振幅怎么被压进等级，再挑一个达标的位深提交——判定会在你的信号上实际量化并测量 SNR。",
    hint: "经验规律是每多 1 bit 约少一半的量化误差（SNR 约高 6 dB）。从低位深听起，噪声像一层沙沙的地板。",
    takeaway:
      "位深 × 6 dB 左右就是量化噪声的控制钮：位数越少噪声地板越高，但更多位深意味着更大的数据量。",
    probes: [
      { label: "2 bit（只剩 4 级）", params: { sampleRate: 44100, bitDepth: 2, channels: 1 } },
      { label: "4 bit / 16 级", params: { sampleRate: 44100, bitDepth: 4, channels: 1 } },
      { label: "8 bit / 256 级", params: { sampleRate: 44100, bitDepth: 8, channels: 1 } },
      { label: "12 bit / 4096 级", params: { sampleRate: 44100, bitDepth: 12, channels: 1 } },
    ],
  },
  {
    index: 4,
    id: "full-link",
    title: "整条链路",
    englishTitle: "The Full Link",
    kind: "design",
    rateBudgetHz: null,
    snrBudgetDb: 34,
    bitDepthCap: null,
    byteBudget: 300_000,
    mission:
      "任务：设计一套完整数字化方案——采样率 + 位深 + 声道策略。线路只给 300 KB 的 PCM 数据预算，声音还得干净（SNR ≥ 34 dB）且不混叠。",
    description:
      "这次的测试信号是双声道立体声，时长 5 秒。三个旋钮互相牵制：立体声比单声道大一倍，位深和采样率直接乘进数据量。先算一笔账（估算器就在面板上），再调参数、处理、听效果，最后提交方案——判定会拿它去你的信号上逐项验证。",
    hint: "先满足硬约束：采样率 ≥ 最高音两倍、SNR 达标；再用单声道/低位深把数据量压进预算。",
    takeaway: "真实的数字化永远是三笔账一起算：听得见的保真、看不见的混叠、和写得下的数据量。",
    probes: [
      {
        label: "立体声保真派：22050/16/立体声",
        params: { sampleRate: 22050, bitDepth: 16, channels: 2 },
      },
      { label: "均衡：16000/8/立体声", params: { sampleRate: 16000, bitDepth: 8, channels: 2 } },
      { label: "省钱派：11025/8/单声道", params: { sampleRate: 11025, bitDepth: 8, channels: 1 } },
    ],
  },
];

export function getAudioStage(index: number): AudioStageDef | undefined {
  return AUDIO_ENCODING_STAGES.find((s) => s.index === index);
}

/** Linear unlock: a stage opens once the previous one is passed. */
export function audioStageUnlocked(passedStages: readonly number[], index: number): boolean {
  return index <= 1 || passedStages.includes(index - 1);
}

export function nextAudioStage(passedStages: readonly number[]): number {
  for (const stage of AUDIO_ENCODING_STAGES) {
    if (!passedStages.includes(stage.index)) return stage.index;
  }
  return AUDIO_ENCODING_STAGES[AUDIO_ENCODING_STAGES.length - 1].index;
}
