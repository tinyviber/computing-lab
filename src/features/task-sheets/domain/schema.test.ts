import { describe, expect, it } from "vitest";
import { countPromptBlanks, splitPromptBlanks, validateSheetSchema } from "./schema.ts";
import { autoGrade, normalizeFillText } from "./grade.ts";

describe("splitPromptBlanks", () => {
  it("splits prompt into text runs and ordered blank slots", () => {
    expect(splitPromptBlanks("1 字节等于 ${} 位，也叫 ${}。")).toEqual([
      { type: "text", text: "1 字节等于 " },
      { type: "blank", index: 0 },
      { type: "text", text: " 位，也叫 " },
      { type: "blank", index: 1 },
      { type: "text", text: "。" },
    ]);
  });

  it("handles markers at the edges and adjacent markers", () => {
    expect(splitPromptBlanks("${}${}")).toEqual([
      { type: "blank", index: 0 },
      { type: "blank", index: 1 },
    ]);
    expect(countPromptBlanks("${}a${}${}")).toBe(3);
  });

  it("returns a single text segment without markers", () => {
    expect(splitPromptBlanks("没有空格")).toEqual([{ type: "text", text: "没有空格" }]);
    expect(countPromptBlanks("没有空格")).toBe(0);
  });
});

const fillQuestion = (prompt: string, blanks = 1) => ({
  id: "q1",
  type: "fill",
  prompt,
  required: true,
  score: 2,
  blanks: Array.from({ length: blanks }, (_, i) => ({
    id: `b${i + 1}`,
    accept: ["x"],
  })),
});

describe("validateSheetSchema fill-marker parity", () => {
  it("accepts a prompt whose ${} count equals the blank count", () => {
    const result = validateSheetSchema({
      version: 1,
      questions: [fillQuestion("答案 ${} 在这", 1)],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects strict validation when markers and blanks disagree", () => {
    for (const prompt of ["没有标记", "${} ${} 两个"]) {
      const result = validateSheetSchema({ version: 1, questions: [fillQuestion(prompt, 1)] });
      expect(result).toEqual({ ok: false, error: "invalid-fill" });
    }
  });

  it("lets partial drafts carry a marker/blank mismatch", () => {
    const result = validateSheetSchema(
      { version: 1, questions: [fillQuestion("没有标记", 1)] },
      { partial: true },
    );
    expect(result.ok).toBe(true);
  });
});

describe("normalizeFillText", () => {
  it("trims leading/trailing whitespace including fullwidth space", () => {
    expect(normalizeFillText("  abc  ")).toBe("abc");
    expect(normalizeFillText("　abc　")).toBe("abc");
    expect(normalizeFillText("\t abc \n")).toBe("abc");
  });

  it("collapses inner whitespace and folds fullwidth variants", () => {
    expect(normalizeFillText("a　b  c")).toBe("a b c");
    expect(normalizeFillText("ＡＢＣ１２３")).toBe("abc123");
  });

  it("respects case sensitivity opt-in", () => {
    expect(normalizeFillText("Byte")).toBe("byte");
    expect(normalizeFillText("Byte", true)).toBe("Byte");
  });
});

describe("autoGrade trim judging", () => {
  const schema = {
    version: 1 as const,
    questions: [
      {
        id: "q1",
        type: "fill" as const,
        prompt: "${}",
        required: true,
        score: 4,
        blanks: [{ id: "b1", accept: ["8", "八"] }],
      },
    ],
  };

  it("grades a padded answer as correct", () => {
    const result = autoGrade(schema, {
      q1: { type: "fill", blanks: { b1: "   8   " } },
    });
    expect(result.perQuestion.q1).toMatchObject({ score: 4 });
    expect(result.autoScore).toBe(4);
  });
});
