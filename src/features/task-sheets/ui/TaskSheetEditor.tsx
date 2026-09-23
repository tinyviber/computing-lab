/**
 * 问卷星-style sheet editor: a question palette plus a vertical flow of
 * editable question cards. Local validity is checked per card before the
 * debounced whole-document save reaches the server.
 */

import type { Dispatch } from "react";
import { Icon } from "../../../shared/ui/Icon";
import {
  SHEET_LIMITS,
  type ChoiceQuestion,
  type FillQuestion,
  type Question,
  type SheetSchema,
  type ShortQuestion,
} from "../domain/schema";

export type EditorState = {
  title: string;
  description: string;
  questions: Question[];
};

export type EditorAction =
  | { type: "meta"; title?: string; description?: string }
  | { type: "load"; state: EditorState }
  | { type: "add"; kind: Question["type"] }
  | { type: "update"; question: Question }
  | { type: "remove"; id: string }
  | { type: "move"; id: string; dir: -1 | 1 }
  | { type: "duplicate"; id: string };

export const QUESTION_KIND_LABELS: Record<Question["type"], string> = {
  fill: "填空题",
  choice: "选择题",
  short: "简答题",
};

function newId(): string {
  return crypto.randomUUID();
}

function blankOption(id: number) {
  return { id: `o${id}`, text: "" };
}

function makeQuestion(kind: Question["type"], n: number): Question {
  if (kind === "fill") {
    return {
      id: newId(),
      type: "fill",
      prompt: "",
      required: true,
      score: 4,
      blanks: [{ id: `b${n}-1`, accept: [""] }],
    };
  }
  if (kind === "choice") {
    return {
      id: newId(),
      type: "choice",
      prompt: "",
      required: true,
      score: 4,
      multiple: false,
      options: [blankOption(1), blankOption(2), blankOption(3), blankOption(4)],
      correctOptionIds: [],
    };
  }
  return {
    id: newId(),
    type: "short",
    prompt: "",
    required: true,
    maxScore: 10,
    referenceAnswer: "",
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "meta":
      return {
        ...state,
        title: action.title ?? state.title,
        description: action.description ?? state.description,
      };
    case "load":
      return action.state;
    case "add":
      return {
        ...state,
        questions: [...state.questions, makeQuestion(action.kind, state.questions.length + 1)],
      };
    case "update":
      return {
        ...state,
        questions: state.questions.map((q) => (q.id === action.question.id ? action.question : q)),
      };
    case "remove":
      return { ...state, questions: state.questions.filter((q) => q.id !== action.id) };
    case "move": {
      const index = state.questions.findIndex((q) => q.id === action.id);
      const target = index + action.dir;
      if (index < 0 || target < 0 || target >= state.questions.length) return state;
      const questions = [...state.questions];
      [questions[index], questions[target]] = [questions[target], questions[index]];
      return { ...state, questions };
    }
    case "duplicate": {
      const index = state.questions.findIndex((q) => q.id === action.id);
      if (index < 0) return state;
      const copy = JSON.parse(JSON.stringify(state.questions[index])) as Question;
      copy.id = newId();
      const questions = [...state.questions];
      questions.splice(index + 1, 0, copy);
      return { ...state, questions };
    }
  }
}

/** Client-side copy of the strictest server rules, for inline hints. */
export function questionProblem(q: Question): string | null {
  if (q.prompt.trim() === "") return "请填写题干";
  if (q.type === "fill") {
    if (q.blanks.length === 0) return "至少需要一个填空";
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

/**
 * Strip editor-only empties into a saveable schema. Incomplete questions are
 * kept — the server accepts partial drafts and enforces completeness when the
 * sheet is assigned; questionProblem() surfaces issues inline meanwhile.
 */
export function cleanForSave(state: EditorState): SheetSchema {
  const questions: Question[] = [];
  for (const q of state.questions) {
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

/** True when every question is complete enough to assign. */
export function sheetComplete(state: EditorState): boolean {
  return state.title.trim() !== "" && state.questions.every((q) => questionProblem(q) === null);
}

function NumberInput({
  label,
  value,
  onChange,
  min = 1,
  max = SHEET_LIMITS.maxScore,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="ts-num">
      <span>{label}</span>
      <input
        max={max}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        type="number"
        value={value}
      />
    </label>
  );
}

function FillEditor({ q, dispatch }: { q: FillQuestion; dispatch: Dispatch<EditorAction> }) {
  const patch = (next: Partial<FillQuestion>) =>
    dispatch({ type: "update", question: { ...q, ...next } });
  return (
    <div className="ts-q-body">
      <p className="ts-hint">
        每个空可填多个可接受答案（大小写不敏感，自动忽略空格和全半角差异）。
      </p>
      {q.blanks.map((blank, i) => (
        <div className="ts-blank-row" key={blank.id}>
          <span className="ts-blank-label">空 {i + 1}</span>
          <input
            aria-label={`空 ${i + 1} 的可接受答案`}
            onChange={(e) =>
              patch({
                blanks: q.blanks.map((b) =>
                  b.id === blank.id ? { ...b, accept: e.target.value.split(/[;,；，]/) } : b,
                ),
              })
            }
            placeholder="可接受答案，多个用逗号分隔"
            value={blank.accept.join(", ")}
          />
          <label className="ts-check">
            <input
              checked={blank.caseSensitive === true}
              onChange={(e) =>
                patch({
                  blanks: q.blanks.map((b) =>
                    b.id === blank.id ? { ...b, caseSensitive: e.target.checked } : b,
                  ),
                })
              }
              type="checkbox"
            />
            区分大小写
          </label>
          <button
            aria-label={`删除空 ${i + 1}`}
            className="icon-button"
            disabled={q.blanks.length <= 1}
            onClick={() => patch({ blanks: q.blanks.filter((b) => b.id !== blank.id) })}
            type="button"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
      <button
        className="button-ghost ts-add-inline"
        disabled={q.blanks.length >= SHEET_LIMITS.blanksPerQuestion}
        onClick={() =>
          patch({
            blanks: [
              ...q.blanks,
              { id: `b${q.blanks.length + 1}-${Date.now() % 1000}`, accept: [""] },
            ],
          })
        }
        type="button"
      >
        + 添加一个空
      </button>
      <NumberInput label="分值" onChange={(score) => patch({ score })} value={q.score} />
    </div>
  );
}

function ChoiceEditor({ q, dispatch }: { q: ChoiceQuestion; dispatch: Dispatch<EditorAction> }) {
  const patch = (next: Partial<ChoiceQuestion>) =>
    dispatch({ type: "update", question: { ...q, ...next } });
  const markCorrect = (id: string, on: boolean) => {
    const next = q.multiple
      ? on
        ? [...q.correctOptionIds, id]
        : q.correctOptionIds.filter((x) => x !== id)
      : on
        ? [id]
        : [];
    patch({ correctOptionIds: next });
  };
  return (
    <div className="ts-q-body">
      <div className="ts-row">
        <label className="ts-check">
          <input
            checked={q.multiple}
            onChange={(e) => patch({ multiple: e.target.checked, correctOptionIds: [] })}
            type="checkbox"
          />
          允许多选
        </label>
        {q.multiple ? (
          <label className="ts-check">
            <input
              checked={q.partialCredit === true}
              onChange={(e) => patch({ partialCredit: e.target.checked })}
              type="checkbox"
            />
            漏选给部分分
          </label>
        ) : null}
      </div>
      {q.options.map((opt, i) => (
        <div className="ts-option-row" key={opt.id}>
          <input
            aria-label={`选项 ${i + 1} 为正确答案`}
            checked={q.correctOptionIds.includes(opt.id)}
            name={q.multiple ? undefined : `correct-${q.id}`}
            onChange={(e) => markCorrect(opt.id, e.target.checked)}
            type={q.multiple ? "checkbox" : "radio"}
          />
          <input
            aria-label={`选项 ${i + 1} 文本`}
            className="ts-option-text"
            onChange={(e) =>
              patch({
                options: q.options.map((o) =>
                  o.id === opt.id ? { ...o, text: e.target.value } : o,
                ),
              })
            }
            placeholder={`选项 ${i + 1}`}
            value={opt.text}
          />
          <button
            aria-label={`删除选项 ${i + 1}`}
            className="icon-button"
            disabled={q.options.length <= 2}
            onClick={() =>
              patch({
                options: q.options.filter((o) => o.id !== opt.id),
                correctOptionIds: q.correctOptionIds.filter((id) => id !== opt.id),
              })
            }
            type="button"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
      <button
        className="button-ghost ts-add-inline"
        disabled={q.options.length >= SHEET_LIMITS.optionsPerQuestion}
        onClick={() => patch({ options: [...q.options, blankOption(q.options.length + 1)] })}
        type="button"
      >
        + 添加选项
      </button>
      <NumberInput label="分值" onChange={(score) => patch({ score })} value={q.score} />
    </div>
  );
}

function ShortEditor({ q, dispatch }: { q: ShortQuestion; dispatch: Dispatch<EditorAction> }) {
  const patch = (next: Partial<ShortQuestion>) =>
    dispatch({ type: "update", question: { ...q, ...next } });
  return (
    <div className="ts-q-body">
      <NumberInput label="满分" onChange={(maxScore) => patch({ maxScore })} value={q.maxScore} />
      <label className="ts-field">
        <span>参考答案（教师批卷时参考，学生不可见）</span>
        <textarea
          onChange={(e) => patch({ referenceAnswer: e.target.value })}
          rows={2}
          value={q.referenceAnswer ?? ""}
        />
      </label>
    </div>
  );
}

function QuestionCard({
  q,
  index,
  total,
  dispatch,
}: {
  q: Question;
  index: number;
  total: number;
  dispatch: Dispatch<EditorAction>;
}) {
  const problem = questionProblem(q);
  return (
    <section
      aria-label={`第 ${index + 1} 题`}
      className={`ts-card${problem ? " has-problem" : ""}`}
    >
      <header className="ts-card-head">
        <span className="ts-card-index">Q{index + 1}</span>
        <span className="ts-badge">{QUESTION_KIND_LABELS[q.type]}</span>
        <label className="ts-check">
          <input
            checked={q.required}
            onChange={(e) =>
              dispatch({ type: "update", question: { ...q, required: e.target.checked } })
            }
            type="checkbox"
          />
          必答
        </label>
        <span className="ts-card-actions">
          <button
            aria-label="上移"
            className="icon-button"
            disabled={index === 0}
            onClick={() => dispatch({ type: "move", id: q.id, dir: -1 })}
            type="button"
          >
            <Icon name="chevron-up" size={13} />
          </button>
          <button
            aria-label="下移"
            className="icon-button"
            disabled={index === total - 1}
            onClick={() => dispatch({ type: "move", id: q.id, dir: 1 })}
            type="button"
          >
            <Icon name="chevron-down" size={13} />
          </button>
          <button
            aria-label="复制本题"
            className="icon-button"
            onClick={() => dispatch({ type: "duplicate", id: q.id })}
            type="button"
          >
            <Icon name="copy" size={13} />
          </button>
          <button
            aria-label="删除本题"
            className="icon-button danger"
            onClick={() => dispatch({ type: "remove", id: q.id })}
            type="button"
          >
            <Icon name="x" size={14} />
          </button>
        </span>
      </header>
      <label className="ts-field ts-prompt">
        <textarea
          aria-label="题干"
          onChange={(e) => dispatch({ type: "update", question: { ...q, prompt: e.target.value } })}
          placeholder="输入题干…"
          rows={2}
          value={q.prompt}
        />
      </label>
      {q.type === "fill" ? (
        <FillEditor dispatch={dispatch} q={q} />
      ) : q.type === "choice" ? (
        <ChoiceEditor dispatch={dispatch} q={q} />
      ) : (
        <ShortEditor dispatch={dispatch} q={q} />
      )}
      {problem ? (
        <p className="ts-problem" role="alert">
          {problem}
        </p>
      ) : null}
    </section>
  );
}

export function TaskSheetEditor({
  state,
  dispatch,
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}) {
  return (
    <div className="ts-editor">
      <div className="ts-meta">
        <label className="ts-field">
          <span>任务单标题</span>
          <input
            maxLength={SHEET_LIMITS.title}
            onChange={(e) => dispatch({ type: "meta", title: e.target.value })}
            placeholder="例如：第一章 · 数制与编码"
            value={state.title}
          />
        </label>
        <label className="ts-field">
          <span>说明（学生作答前可见）</span>
          <textarea
            onChange={(e) => dispatch({ type: "meta", description: e.target.value })}
            placeholder="给学生的说明、要求或提交须知…"
            rows={2}
            value={state.description}
          />
        </label>
      </div>

      <div className="ts-palette" role="group" aria-label="添加题目">
        <span className="eyebrow">添加题目</span>
        {(Object.keys(QUESTION_KIND_LABELS) as Question["type"][]).map((kind) => (
          <button
            className="button button-secondary ts-palette-btn"
            key={kind}
            onClick={() => dispatch({ type: "add", kind })}
            type="button"
          >
            + {QUESTION_KIND_LABELS[kind]}
          </button>
        ))}
      </div>

      <div className="ts-flow">
        {state.questions.map((q, i) => (
          <QuestionCard
            dispatch={dispatch}
            index={i}
            key={q.id}
            q={q}
            total={state.questions.length}
          />
        ))}
        {state.questions.length === 0 ? (
          <p className="ts-empty">还没有题目——从上方选择题型开始出题。</p>
        ) : null}
      </div>
    </div>
  );
}
