import {
  createFivePartsLessonState,
  transitionFivePartsLesson,
  type FivePartsLessonState,
} from "../lesson/state.ts";
import { createFivePartsViewModel } from "../controller/createViewModel.ts";
import type { FivePartsLabActions, FivePartsLabViewModel } from "../controller/viewModel.ts";
import type { StorageOp } from "../domain/storage.ts";

/**
 * Synthetic verdict copy for previews only. Real feedback is written by the
 * server judge; previews never call it.
 */
const PREVIEW_FEEDBACK = "预览：示例反馈文字（真实反馈由服务端判题给出）。";

/** Public, synthetic scenes only — no server data, no real projects. */
function fixture(
  options: {
    a?: number;
    b?: number;
    step?: number;
    stage?: number;
    answer?: string;
    passed?: number[];
    storageOps?: StorageOp[];
    saveStatus?: "saving" | "error";
    loadError?: string;
    verdict?: "correct" | "wrong";
  } = {},
): FivePartsLabViewModel {
  const stage = options.stage ?? 1;
  let state: FivePartsLessonState = createFivePartsLessonState(stage);
  state = transitionFivePartsLesson(state, {
    type: "load-project",
    currentStage: stage,
    passedStages: options.passed ?? (stage > 1 ? [1] : []),
    drafts: {},
  });
  if (options.a !== undefined) {
    state = transitionFivePartsLesson(state, { type: "set-input", field: "a", value: options.a });
  }
  if (options.b !== undefined) {
    state = transitionFivePartsLesson(state, { type: "set-input", field: "b", value: options.b });
  }
  if (options.step) {
    state = transitionFivePartsLesson(state, { type: "set-step", step: options.step });
  }
  for (const op of options.storageOps ?? []) {
    state = transitionFivePartsLesson(state, { type: "storage-op", op });
  }
  if (options.answer) {
    state = transitionFivePartsLesson(state, { type: "set-answer", optionId: options.answer });
  }
  if (options.verdict) {
    const passed = options.verdict === "correct";
    state = transitionFivePartsLesson(state, {
      type: "judge-result",
      outcome: {
        passed,
        stageIndex: stage,
        feedback: PREVIEW_FEEDBACK,
        submissionId: "preview-synthetic",
        currentStage: stage,
        passedStages: state.passedStages,
        parts: [{ id: "preview-answer", label: "预览", ok: passed, detail: null }],
      },
    });
  }
  if (options.saveStatus) {
    state = transitionFivePartsLesson(state, { type: "mark-saving", stageIndex: state.stageIndex });
    if (options.saveStatus === "error") {
      state = transitionFivePartsLesson(state, {
        type: "mark-save-error",
        stageIndex: state.stageIndex,
      });
    }
  }
  return createFivePartsViewModel({
    state,
    submitting: false,
    loadError: options.loadError ?? null,
    submitError: null,
  });
}

export const fivePartsPreviewFixtures = [
  { id: "initial", label: "初始 · 3 + 5", model: fixture() },
  { id: "inputs-changed", label: "改输入 · 7 + 2", model: fixture({ a: 7, b: 2 }) },
  { id: "step-memory", label: "步骤 1 · 存入存储器", model: fixture({ step: 1 }) },
  { id: "step-controller", label: "步骤 2 · 控制器下令", model: fixture({ step: 2 }) },
  { id: "step-alu", label: "步骤 3 · 算出 8", model: fixture({ step: 3 }) },
  { id: "step-output", label: "步骤 4 · 输出结果", model: fixture({ step: 4 }) },
  { id: "think-page", label: "思考页 · 未作答", model: fixture({ stage: 2 }) },
  {
    id: "think-wrong",
    label: "思考页 · 答错",
    model: fixture({ stage: 2, answer: "memory", verdict: "wrong" }),
  },
  { id: "storage-initial", label: "内存与外存 · 未打开", model: fixture({ stage: 3 }) },
  {
    id: "storage-unsaved",
    label: "内存与外存 · 写了没保存",
    model: fixture({ stage: 3, storageOps: ["open", "write", "cpu-read"] }),
  },
  {
    id: "storage-power-off",
    label: "内存与外存 · 断电",
    model: fixture({ stage: 3, storageOps: ["open", "write", "power-off"] }),
  },
  {
    id: "storage-correct",
    label: "内存与外存 · 答对",
    model: fixture({
      stage: 3,
      storageOps: ["open", "write", "power-off"],
      answer: "ram-cleared",
      verdict: "correct",
    }),
  },
  { id: "phone-initial", label: "手机 · 未开始", model: fixture({ stage: 4 }) },
  { id: "phone-step-input", label: "手机 · 步骤 1 输入", model: fixture({ stage: 4, step: 1 }) },
  {
    id: "phone-step-output",
    label: "手机 · 步骤 4 触摸屏输出",
    model: fixture({ stage: 4, step: 4 }),
  },
  {
    id: "phone-wrong",
    label: "手机 · 答错",
    model: fixture({ stage: 4, step: 5, answer: "input", verdict: "wrong" }),
  },
  { id: "saving", label: "正在保存", model: fixture({ saveStatus: "saving" }) },
  { id: "save-error", label: "保存异常", model: fixture({ saveStatus: "error" }) },
  {
    id: "load-error",
    label: "加载异常",
    model: fixture({ loadError: "预览：草稿加载失败，请稍后重试。" }),
  },
] as const;

/** Fixed scenes record intents; they never fetch, save, or submit. */
export function createFivePartsPreviewActions(
  record: (action: string) => void,
): FivePartsLabActions {
  return {
    selectStage: (index) => record(`selectStage(${index})`),
    adjustInput: (field, delta) => record(`adjustInput(${field}, ${delta})`),
    nextStep: () => record("nextStep"),
    resetDemo: () => record("resetDemo"),
    pickAnswer: (id) => record(`pickAnswer(${id})`),
    continueToThink: () => record("continueToThink"),
    storageOp: (op) => record(`storageOp(${op})`),
    dismissMessage: () => record("dismissMessage"),
    restoreConflictLocal: () => record("restoreConflictLocal"),
    discardConflictLocal: () => record("discardConflictLocal"),
    retrySyncConflict: () => record("retrySyncConflict"),
  };
}
