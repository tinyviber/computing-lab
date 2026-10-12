import { describe, expect, it } from "vitest";
import type { ChoiceQuestion, FillQuestion, ShortQuestion } from "./schema.ts";
import { cleanForSave, questionProblem, sheetComplete } from "./validation.ts";

const fillQuestion = (overrides?: Partial<FillQuestion>): FillQuestion => ({
  id: "q1",
  type: "fill",
  prompt: "1 字节等于 ${} 位。",
  required: true,
  score: 2,
  blanks: [{ id: "b1", accept: ["8", "八"] }],
  ...overrides,
});

const choiceQuestion = (overrides?: Partial<ChoiceQuestion>): ChoiceQuestion => ({
  id: "q2",
  type: "choice",
  prompt: "1KB 等于多少字节？",
  required: true,
  score: 2,
  multiple: false,
  options: [
    { id: "o1", text: "1000" },
    { id: "o2", text: "1024" },
  ],
  correctOptionIds: ["o2"],
  ...overrides,
});

const shortQuestion = (overrides?: Partial<ShortQuestion>): ShortQuestion => ({
  id: "q3",
  type: "short",
  prompt: "解释为什么计算机用二进制。",
  required: true,
  maxScore: 10,
  referenceAnswer: "因为只有两种稳定状态。",
  ...overrides,
});

describe("questionProblem", () => {
  it("flags an empty prompt before anything else", () => {
    expect(questionProblem(fillQuestion({ prompt: "  " }))).toBe("请填写题干");
    expect(questionProblem(choiceQuestion({ prompt: "" }))).toBe("请填写题干");
    expect(questionProblem(shortQuestion({ prompt: "" }))).toBe("请填写题干");
  });

  it("accepts a complete fill question", () => {
    expect(questionProblem(fillQuestion())).toBeNull();
  });

  it("requires markers in the prompt to match the blank count", () => {
    const q = fillQuestion({ blanks: [fillQuestion().blanks[0], { id: "b2", accept: ["x"] }] });
    expect(questionProblem(q)).toContain("一致");
  });

  it("requires every blank to have at least one accept answer", () => {
    const q = fillQuestion({ blanks: [{ id: "b1", accept: ["", "  "] }] });
    expect(questionProblem(q)).toBe("每个空至少需要一个可接受答案");
  });

  it("requires a positive score on fill and choice", () => {
    expect(questionProblem(fillQuestion({ score: 0 }))).toBe("分值需大于 0");
    expect(questionProblem(choiceQuestion({ score: 0 }))).toBe("分值需大于 0");
  });

  it("requires two non-empty options and a marked answer on choice", () => {
    expect(
      questionProblem(
        choiceQuestion({
          options: [
            { id: "o1", text: "1000" },
            { id: "o2", text: "  " },
          ],
        }),
      ),
    ).toBe("至少需要两个选项");
    expect(questionProblem(choiceQuestion({ correctOptionIds: [] }))).toBe("请标记正确答案");
  });

  it("rejects multiple correct answers on a single-choice question", () => {
    const q = choiceQuestion({ correctOptionIds: ["o1", "o2"] });
    expect(questionProblem(q)).toBe("单选题只能有一个正确答案");
    expect(
      questionProblem(choiceQuestion({ multiple: true, correctOptionIds: ["o1", "o2"] })),
    ).toBeNull();
  });

  it("requires a positive maxScore on short questions", () => {
    expect(questionProblem(shortQuestion({ maxScore: 0 }))).toBe("分值需大于 0");
    expect(questionProblem(shortQuestion())).toBeNull();
  });
});

describe("sheetComplete", () => {
  it("requires a non-empty title", () => {
    expect(sheetComplete({ title: "  ", questions: [choiceQuestion()] })).toBe(false);
  });

  it("is false while any question has a problem", () => {
    const bad = fillQuestion({ prompt: "" });
    expect(sheetComplete({ title: "任务单", questions: [choiceQuestion(), bad] })).toBe(false);
  });

  it("is true when title is set and every question is complete", () => {
    const sheet = {
      title: "第一章",
      questions: [fillQuestion(), choiceQuestion(), shortQuestion()],
    };
    expect(sheetComplete(sheet)).toBe(true);
  });
});

describe("cleanForSave", () => {
  it("trims prompts and drops empty accept entries and options", () => {
    const draft = {
      questions: [
        fillQuestion({
          prompt: "  1 字节等于 ${} 位。  ",
          blanks: [{ id: "b1", accept: ["8", "", "  "] }],
        }),
        choiceQuestion({
          prompt: "  题干  ",
          options: [
            { id: "o1", text: "1000" },
            { id: "o2", text: "1024" },
            { id: "o3", text: "" },
          ],
        }),
      ],
    };
    const schema = cleanForSave(draft);
    expect(schema.version).toBe(1);
    const [fill, choice] = schema.questions;
    expect(fill.prompt).toBe("1 字节等于 ${} 位。");
    expect(fill.type === "fill" ? fill.blanks[0].accept : []).toEqual(["8"]);
    expect(choice.type === "choice" ? choice.options.map((o) => o.id) : []).toEqual(["o1", "o2"]);
  });

  it("keeps incomplete questions — the server re-validates on assign", () => {
    const schema = cleanForSave({ questions: [choiceQuestion({ correctOptionIds: [] })] });
    expect(schema.questions).toHaveLength(1);
  });
});
