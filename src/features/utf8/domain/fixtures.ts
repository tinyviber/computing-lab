import type { Utf8Scenario, Utf8ScenarioId } from "./model";

export const UTF8_SCENARIOS: Readonly<Record<Utf8ScenarioId, Utf8Scenario>> = {
  ascii: { id: "ascii", title: "ASCII", text: "A", codePoints: [0x41] },
  accent: { id: "accent", title: "Accented Latin", text: "é", codePoints: [0xe9] },
  cjk: { id: "cjk", title: "CJK character", text: "猫", codePoints: [0x732b] },
  emoji: { id: "emoji", title: "Emoji", text: "🙂", codePoints: [0x1f642] },
  mixed: {
    id: "mixed",
    title: "Mixed text",
    text: "Aé猫🙂",
    codePoints: [0x41, 0xe9, 0x732b, 0x1f642],
  },
};

export const DEFAULT_UTF8_SCENARIO: Utf8ScenarioId = "mixed";

export function getUtf8Scenario(id: Utf8ScenarioId): Utf8Scenario {
  return UTF8_SCENARIOS[id];
}
