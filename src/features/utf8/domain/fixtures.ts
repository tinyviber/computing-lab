import type { Utf8Scenario, Utf8ScenarioId } from "./model";

export const UTF8_SCENARIOS: Readonly<Record<Utf8ScenarioId, Utf8Scenario>> = {
  ascii: { id: "ascii", title: "ASCII 字符", text: "A", codePoints: [0x41] },
  accent: { id: "accent", title: "带重音拉丁字母", text: "é", codePoints: [0xe9] },
  cjk: { id: "cjk", title: "CJK 字符", text: "猫", codePoints: [0x732b] },
  emoji: { id: "emoji", title: "表情符号", text: "🙂", codePoints: [0x1f642] },
  "boundary-1-2": {
    id: "boundary-1-2",
    title: "1/2 字节边界",
    text: "\u007f\u0080",
    codePoints: [0x7f, 0x80],
  },
  "boundary-2-3": {
    id: "boundary-2-3",
    title: "2/3 字节边界",
    text: "\u07ff\u0800",
    codePoints: [0x7ff, 0x800],
  },
  "boundary-3-4": {
    id: "boundary-3-4",
    title: "3/4 字节边界",
    text: "\uffff\u{10000}",
    codePoints: [0xffff, 0x10000],
  },
  mixed: {
    id: "mixed",
    title: "混合文本",
    text: "Aé猫🙂",
    codePoints: [0x41, 0xe9, 0x732b, 0x1f642],
  },
};

export const DEFAULT_UTF8_SCENARIO: Utf8ScenarioId = "mixed";

export function getUtf8Scenario(id: Utf8ScenarioId): Utf8Scenario {
  return UTF8_SCENARIOS[id];
}
