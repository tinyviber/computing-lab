/**
 * Draft-side completeness checks for the task-sheet editor: the strictest
 * server rules mirrored client-side for inline hints, plus the save-time
 * cleanup that strips editor-only empties into a saveable schema. These take
 * structural { title, questions } inputs so they stay usable from both the
 * lesson state machine and the server boundary without importing either.
 */

import { BLANK_MARKER, countPromptBlanks, type Question, type SheetSchema } from "./schema.ts";

/** Client-side copy of the strictest server rules, for inline hints. */
export function questionProblem(q: Question): string | null {
  if (q.prompt.trim() === "") return "请填写题干";
  if (q.type === "fill") {
    if (q.blanks.length === 0) return "至少需要一个填空";
    const markers = countPromptBlanks(q.prompt);
    if (markers !== q.blanks.length) {
      return `题干中的 ${BLANK_MARKER} 标记（${markers} 个）需与空数（${q.blanks.length} 个）一致`;
    }
    if (q.blanks.some((b) => b.accept.every((a) => a.trim() === ""))) {
      return "每个空至少需要一个可接受答案";
    }
    if (!(q.score > 0)) return "分值需大于 0";
  } else if (q.type === "choice") {
    if (q.options.filter((o) => o.text.trim() !== "").length < 2) return "至少需要两个选项";
    if (q.correctOptionIds.length === 0) return "请标记正确答案";
    if (!q.multiple && q.correctOptionIds.length > 1) return "单选题只能有一个正确答案";
    if (!(q.score > 0)) return "分值需大于 0";
  } else if (!(q.maxScore > 0)) {
    return "分值需大于 0";
  }
  return null;
}

/** True when every question is complete enough to assign. */
export function sheetComplete(sheet: { title: string; questions: Question[] }): boolean {
  return sheet.title.trim() !== "" && sheet.questions.every((q) => questionProblem(q) === null);
}

/**
 * Strip editor-only empties into a saveable schema. Incomplete questions are
 * kept — the server accepts partial drafts and enforces completeness when the
 * sheet is assigned; questionProblem() surfaces issues inline meanwhile.
 */
export function cleanForSave(draft: { questions: Question[] }): SheetSchema {
  const questions: Question[] = [];
  for (const q of draft.questions) {
    if (q.type === "fill") {
      questions.push({
        ...q,
        prompt: q.prompt.trim(),
        blanks: q.blanks.map((b) => ({ ...b, accept: b.accept.filter((a) => a.trim() !== "") })),
      });
    } else if (q.type === "choice") {
      questions.push({
        ...q,
        prompt: q.prompt.trim(),
        options: q.options.filter((o) => o.text.trim() !== ""),
      });
    } else {
      questions.push({ ...q, prompt: q.prompt.trim() });
    }
  }
  return { version: 1, questions };
}
