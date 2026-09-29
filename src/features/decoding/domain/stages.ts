/**
 * Stage contracts for the decoding lab — one thread through three encodings:
 * characters, binary representation, and a real BMP file. The single concept
 * every stage reinforces: **data + decoding rule → information** — a byte
 * stream has no built-in meaning until a decoder interprets it.
 *
 * Stage kinds drive both the payload shape and the console layout:
 *   "codes"       – a list of decimal integers → text decoder
 *   "bits"        – a list of 8-bit binary strings → bits→int→text decoder
 *   "bmp"         – a constrained 24-bit BMP byte stream → pixel decoder
 *   "bmp-script"  – same BMP, but a ready-made decode_bmp() is provided so
 *                   the student's code composes decoders instead
 *   "files"       – three mystery payloads, two provided decoders, judgment
 *
 * Concept prompts are server-verified option questions (same authority model
 * as the cpu lab's guided answers): passing means a complete all-correct set.
 */

export type DecodingKind = "codes" | "bits" | "bmp" | "bmp-script" | "files";

export type DecodingPrompt = {
  id: string;
  prompt: string;
  /** Exactly one option is correct; wrong picks may carry a note. */
  options: { label: string; correct?: boolean; note?: string }[];
  /** The "aha" line shown once answered correctly. */
  reveal: string;
};

export type DecodingStageDef = {
  index: number;
  id: string;
  title: string;
  englishTitle: string;
  track: "core" | "challenge";
  railAfter?: number;
  unlockAfter?: number[];
  kind: DecodingKind;
  /** The submission needs a signature string alongside the decode result. */
  requiresSignature?: boolean;
  mission: string;
  description: string;
  /** What a submission is judged on, shown up front. */
  task: string;
  hint: string;
  judgeNote: string;
  /** One-line concept recap shown when the stage passes. */
  takeaway: string;
  starterCode: string;
  prompts?: DecodingPrompt[];
};

export const DECODING_STAGES: DecodingStageDef[] = [
  // ---------- 01 — 第一张密码纸 ----------
  {
    index: 1,
    id: "cipher-note",
    title: "第一张密码纸",
    englishTitle: "The Cipher Note",
    track: "core",
    kind: "codes",
    mission:
      "桌上有一张纸条，只留下一串数字——没有署名，没有单词。旁边贴着课堂上那张字符编码表。它到底在说什么？",
    description:
      "先别急着写代码：拿编码表把前两个数还原成字符，确认这串数确实在「说话」。然后补全 decode(data)——data 就是这串整数——让它返回还原出的字符串。",
    task: "提交 decode(data) 还原出的单词。每个人的密码纸都不一样，它随你的账号生成。",
    hint: "编码表是「数 → 字符」的约定；循环做的事就是把查表自动化。Python 里 chr(code) 就是这张表。",
    judgeNote: "判定比对你提交的字符串与本关为你生成的那张密码纸——别人抄不了你的答案。",
    takeaway: "字符编码是「字符 ↔ 数值」的约定：一串数看不懂，配上约定就变成了单词。",
    starterCode: `def decode(data):
    # data: 一串十进制整数, 每个数对应编码表里的一个字符
    answer = ""
    for code in data:
        # TODO: 把 code 变成字符 (用 chr(code), 或自己查表)
        answer += "?"
    return answer
`,
    prompts: [
      {
        id: "what-is-encoding",
        prompt: "把 67 还原成 'C'，靠的是什么？",
        options: [
          { label: "一张大家约定好的「数 → 字符」对照表", correct: true },
          {
            label: "数字 67 天生就长得像 C",
            note: "数只是数——是约定给了它含义。",
          },
          {
            label: "计算机自己认得所有字符",
            note: "没有对照表，计算机眼里也只有一堆数。",
          },
        ],
        reveal: "字符编码就是约定：同一个数换一张表可能变成别的字符——约定本身才叫编码。",
      },
    ],
  },

  // ---------- 02 — 0 和 1 没换密码 ----------
  {
    index: 2,
    id: "same-digits",
    title: "0 和 1 没换密码",
    englishTitle: "Same Number, New Suit",
    track: "core",
    kind: "bits",
    mission:
      "第二张密码纸上全是 0 和 1。发送方留言：还是同一张编码表，只是把每个数换成了二进制写法。",
    description:
      "每 8 位是一个字节。先手工把第一组二进制转成十进制、再查表确认它是字符——然后让 decode 一口气处理整段。",
    task: "提交 decode(data) 还原出的整句话。data 是一组 8 位 0/1 字符串。",
    hint: 'int("01001000", 2) 会把 8 位二进制转成十进制 72——之后走的还是第一关那张表。',
    judgeNote: "判定比对你提交的句子与本关密文；概念题也必须全部答对。",
    takeaway:
      "二进制和十进制是同一个数的两种写法，不是两套编码——数怎么写是一层，数对应哪个字符是另一层。",
    starterCode: `def decode(data):
    # data: 8 位一组的 0/1 字符串, 例如 ["01001000", "01101001"]
    answer = ""
    for group in data:
        n = int(group, 2)   # 先把 8 位二进制转成十进制
        # TODO: n -> 字符
        answer += chr(n)
    return answer
`,
    prompts: [
      {
        id: "repr-vs-encoding",
        prompt: "72 和 01001000 的关系是——",
        options: [
          { label: "同一个数的两种写法", correct: true },
          {
            label: "两套不同的字符编码",
            note: "编码表没变——变的只是数的写法。",
          },
          {
            label: "一个是明文，一个是密码",
            note: "它们表示的是同一个数。",
          },
        ],
        reveal: "把数写成二进制还是十进制只是写法不同——它对应的字符没变。",
      },
      {
        id: "where-encoding",
        prompt: "字符编码真正起作用的是哪一步？",
        options: [
          { label: "把数解释成字符那一步", correct: true },
          {
            label: "把 bit 排成 8 位一组那一步",
            note: "分组只决定这个数是多少。",
          },
          {
            label: "把 0 和 1 写下来那一步",
            note: "写下写法不等于解释含义。",
          },
        ],
        reveal: "进制是数值的表示方式；编码是数值到字符的约定——两件事发生在不同层次。",
      },
    ],
  },

  // ---------- 03 — 救回一张 BMP ----------
  {
    index: 3,
    id: "rescue-bmp",
    title: "救回一张 BMP",
    englishTitle: "Rescue the Bitmap",
    track: "core",
    kind: "bmp",
    requiresSignature: true,
    mission:
      "收到一个没有扩展名的文件：一长串字节，来源不明。传说这类文件会在开头写下自己的「签名」——用字符规则先把最前面的字节读出来。",
    description:
      "前两个字节按字符表一读，就能看出该用什么规则解释剩下的字节。确认签名之后，按下方给出的格式约定把字节组织成像素——真正的挑战是把 bytes 排对，不是背文件格式。",
    task: "提交你读出的签名 + decode(data) 还原出的像素矩阵。",
    hint: "格式约定：前 54 字节是文件头；像素数据从 data[54] 开始；每个像素 3 字节，按 B、G、R 排列；图像最下面一行存在最前面。",
    judgeNote: "判定比对你的签名与整张像素矩阵——通道顺序、行序错一个都会露馅。",
    takeaway: "你一个字节都没改：数据没变，换的是解释规则——不同的 decoder 恢复出不同的信息。",
    starterCode: `def decode(data):
    # data: 一个 BMP 文件的全部字节
    # 已确认的格式约定:
    #   前 54 字节是文件头, 像素数据从 data[54] 开始
    #   每个像素 3 字节, 顺序是 B, G, R
    #   宽 8 高 8, 图像最下面一行存在最前面
    width = 8
    height = 8
    pixels = []
    # TODO: 从 data[54:] 每 3 个字节读一个像素,
    #       按 B,G,R 换成 R,G,B, 再按宽分行;
    #       最后别忘了处理行序
    return pixels
`,
    prompts: [
      {
        id: "signature-meaning",
        prompt: "你从字节流里读出的 'BM' 是——",
        options: [
          { label: "按字符规则解释开头两个字节的结果", correct: true },
          {
            label: "文件名的一部分",
            note: "文件名根本不在字节流里。",
          },
          {
            label: "图片自己打印的文字",
            note: "它只是两个数值——字符表一解释才成了标记。",
          },
        ],
        reveal: "签名是写文件的程序留下的约定：开头几个数值，用字符表一解释就成了 'BM'。",
      },
      {
        id: "data-untouched",
        prompt: "解码这张图的过程中，原始字节被改动过吗？",
        options: [
          { label: "没有——只是换了另一种解释规则", correct: true },
          {
            label: "改了——BGR 被换成了 RGB",
            note: "重排是解释方式；原字节流一个字节都没动。",
          },
          {
            label: "改了一个坏掉的字节",
            note: "这份数据完好无损，缺的不是修数据而是解释。",
          },
        ],
        reveal: "同一份字节数据配上不同 decoder，恢复出的信息就不同——「这是什么」取决于怎么读。",
      },
    ],
  },

  // ---------- 04 — 同一串 bytes ----------
  {
    index: 4,
    id: "whose-bytes",
    title: "同一串 bytes",
    englishTitle: "Whose Bytes Are These",
    track: "core",
    kind: "files",
    mission:
      "三个没有扩展名的片段摆在面前。手里有两个现成的 decoder：decode_as_text 和 decode_as_image。每一段都试试看——只有配上正确的解释规则，结果才有意义。",
    description:
      "对每个文件分别用两种解释跑一遍：一边可能产出单词，一边可能产出图案——也可能两边都「能跑」。最后对照元数据卡片下结论。",
    task: "为每个文件选定正确的 decoder，并提交该 decoder 的真实输出。",
    hint: "两个 decoder 用在错误的输入上「也能跑」——跑得出结果不代表解释对了。元数据是发送方留下的提示。",
    judgeNote: "判定核对每个文件的 decoder 选择与对应的解码输出。",
    takeaway: "bytes 本身没有类型魔法：文件格式、字符编码和元数据，才告诉程序该怎么解释它们。",
    starterCode: "",
    prompts: [
      {
        id: "how-to-decide",
        prompt: "两个 decoder 都跑出了结果，凭什么定哪个是真的？",
        options: [
          { label: "看哪个结果有意义，并且和元数据一致", correct: true },
          { label: "看哪个跑得快", note: "速度跟解释对不对没有关系。" },
          {
            label: "看哪个结果更长",
            note: "输出长度说明不了含义。",
          },
        ],
        reveal:
          "「能跑」不是证据——「有意义 + 元数据一致」才是。格式、编码规则和元数据共同决定解释方式。",
      },
    ],
  },

  // ---------- X1 — 图里藏了一句话 ----------
  {
    index: 5,
    id: "channel-secret",
    title: "图里藏了一句话",
    englishTitle: "A Message in the Channel",
    track: "challenge",
    railAfter: 3,
    unlockAfter: [3],
    kind: "bmp-script",
    mission:
      "这张 BMP 看着和第 3 关没什么不同，但情报说：发送方每隔一个像素，就往 R 通道里藏了一个字符编码，用 0 收尾。",
    description:
      "现成的 decode_bmp(data) 已经备好——它返回像素矩阵。把藏在 R 通道里的编码值取出来，再走一次字符解码：颜色背后藏着一句话。",
    task: "提交 decode(data) 还原出的那句话。",
    hint: "按行优先把像素摊平，从第 0 个像素起每隔一个取一个 R 值；取出的是编码，还得查一次表。",
    judgeNote: "判定比对提取出的字符串。",
    takeaway: "同一份文件里，不同区域可以有不同解释规则——decoder 是可以串起来用的。",
    starterCode: `def decode(data):
    # 提供了 decode_bmp(data): 返回像素矩阵 [[[r, g, b], ...], ...]
    pixels = decode_bmp(data)
    message = ""
    # 情报: 发送方把字符编码藏进了 R 通道 ——
    # 从第 0 个像素起每隔一个像素取一个 R 值, 遇到 0 结束
    # TODO: 取出藏着的编码, 变回一句话
    return message
`,
  },

  // ---------- X2 — 修好坏掉的 decoder ----------
  {
    index: 6,
    id: "fix-the-decoder",
    title: "修好坏掉的 decoder",
    englishTitle: "Fix the Decoder",
    track: "challenge",
    railAfter: 4,
    unlockAfter: [3],
    kind: "bmp",
    mission:
      "同事留下的 decoder 信誓旦旦能解 BMP——跑出来的却是一团乱。代码就在编辑器里，逐行找出它哪里读错了。",
    description:
      "对照第 3 关确认的格式约定排查：像素数据从第几个字节开始？通道什么顺序？行怎么排？改好后先跑一遍看图像是否正常，再提交。",
    task: "提交修好的 decode(data) 跑出的像素矩阵。",
    hint: "已知有 3 处错误：一个在文件头长度、一个在通道顺序、一个在行序。",
    judgeNote: "判定比对整张像素矩阵——三处错误缺一不可。",
    takeaway: "decoder 里每个常量都是一条约定——写错任何一条，同一份数据就变成乱码。",
    starterCode: `def decode(data):
    # data: 一个 BMP 文件的全部字节
    width = 8
    height = 8
    body = data[45:]
    pixels = []
    for y in range(height):
        row = []
        for x in range(width):
            i = (y * width + x) * 3
            r = body[i]
            g = body[i + 1]
            b = body[i + 2]
            row.append([r, g, b])
        pixels.append(row)
    return pixels
`,
  },
];

export const DECODING_CORE_STAGES = DECODING_STAGES.filter((s) => s.track === "core");

export function getDecodingStage(index: number): DecodingStageDef | undefined {
  return DECODING_STAGES.find((s) => s.index === index);
}

/** Core stages unlock linearly; challenges need their explicit prerequisites. */
export function decodingStageUnlocked(passedStages: readonly number[], index: number): boolean {
  const stage = getDecodingStage(index);
  if (!stage) return false;
  if (stage.unlockAfter) return stage.unlockAfter.every((i) => passedStages.includes(i));
  return index === 1 || passedStages.includes(index - 1);
}

/** Next stage to work on: first unpassed index, capped past the last stage. */
export function nextDecodingStage(passedStages: readonly number[]): number {
  for (const stage of DECODING_STAGES) {
    if (!passedStages.includes(stage.index)) return stage.index;
  }
  return DECODING_STAGES.length + 1;
}
