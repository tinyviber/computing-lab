import { judgeCase, runProgram } from "../domain/machine.ts";
import { getCpuStage } from "../domain/stages.ts";
import { publicCasesFor } from "../lesson/publicCases.ts";
import { createCpuLessonState, programOf } from "../lesson/state.ts";
import { createCpuLabViewModel } from "../controller/createViewModel.ts";
import type {
  CpuClock,
  CpuLabActions,
  CpuLabViewModel,
  CpuPlaybackView,
} from "../controller/viewModel.ts";

/** Public, synthetic data only. Never import server judge/hiddenSet or real projects. */
function fixture(
  options: {
    stage?: number;
    caseIndex?: number;
    view?: Partial<CpuPlaybackView>;
    clock?: CpuClock;
    answerCount?: number;
    saveStatus?: "saving" | "error";
    loadError?: string;
    judgeFailed?: boolean;
  } = {},
): CpuLabViewModel {
  const state = createCpuLessonState(options.stage ?? 1);
  state.passedStages = Array.from({ length: state.stageIndex - 1 }, (_, i) => i + 1);
  state.calculatorCoreComplete = false;
  state.saveStatusByStage = options.saveStatus ? { [state.stageIndex]: options.saveStatus } : {};
  const stage = getCpuStage(state.stageIndex)!;
  const answers = Object.fromEntries(
    (stage.guided?.prompts ?? [])
      .slice(0, options.answerCount ?? 0)
      .map((p) => [p.id, p.options.findIndex((o) => o.correct)]),
  );
  state.guidedAnswers = { [stage.index]: answers };
  const cases = publicCasesFor(stage.index, 42);
  const rows = programOf(state);
  const caseIndex = options.caseIndex ?? 0;
  const run = runProgram(
    rows,
    cases[caseIndex].initMem,
    cases[caseIndex].initRegs,
    stage.maxCycles,
  );
  if (options.judgeFailed) {
    const verdict = judgeCase(rows, cases[0], {
      scratchCells: stage.scratchCells,
      maxCycles: stage.maxCycles,
    });
    state.judgeOutcome = {
      score: 0,
      total: 1,
      passed: false,
      submissionId: "preview-synthetic",
      currentStage: stage.index,
      passedStages: state.passedStages,
      unlockedComponent: null,
      testSummary: {
        categories: { 预览用公开数据: { passed: 0, total: 1 } },
        results: [{ name: cases[0].name, category: cases[0].category, passed: false }],
        counterexample: {
          name: cases[0].name,
          category: cases[0].category,
          reason: verdict.reason,
          cyclesUsed: run.final.cycles,
          cycleBudget: cases[0].expect.cycles,
          initMem: cases[0].initMem,
          initRegs: cases[0].initRegs,
          memDiff: verdict.memDiff,
          regDiff: verdict.regDiff,
          trace: run.trace,
          finalRegs: run.final.regs,
          selfModFetch: run.selfModFetch,
        },
        branchOneWayOnly: false,
        error: null,
      },
    };
  }
  return createCpuLabViewModel({
    state,
    run,
    view: { cursor: 0, visited: 0, phase: "fetch", ...options.view },
    clock: options.clock ?? "idle",
    caseIndex,
    replayCase: null,
    publicCases: cases,
    observedCases: new Set(),
    promptOptionOrders: {},
    recordingPrompt: false,
    submitting: false,
    loadError: options.loadError ?? null,
    submitError: null,
  });
}

export const cpuPreviewFixtures = [
  { id: "initial", label: "初始状态", model: fixture() },
  {
    id: "running",
    label: "运行中 · 译码",
    model: fixture({ clock: "running", answerCount: 1, view: { phase: "decode" } }),
  },
  {
    id: "blocked",
    label: "教学阻塞",
    model: fixture({ clock: "paused", answerCount: 1, view: { cursor: 1, visited: 1 } }),
  },
  { id: "judge-failed", label: "判题失败 · 反例", model: fixture({ stage: 4, judgeFailed: true }) },
  { id: "challenge", label: "挑战编辑", model: fixture({ stage: 7 }) },
  { id: "saving", label: "正在保存", model: fixture({ stage: 7, saveStatus: "saving" }) },
  { id: "save-error", label: "保存异常", model: fixture({ stage: 7, saveStatus: "error" }) },
  {
    id: "load-error",
    label: "加载异常",
    model: fixture({ loadError: "预览：草稿加载失败，请稍后重试。" }),
  },
  { id: "byte-gated", label: "字节观察 · 预测锁定", model: fixture({ stage: 2, answerCount: 3 }) },
  {
    id: "alu-exec",
    label: "ALU 执行 · 第五位灯",
    model: fixture({
      stage: 3,
      caseIndex: 1,
      answerCount: 99,
      view: { cursor: 1, visited: 1, phase: "exec" },
    }),
  },
] as const;

/** Fixed scenes record intents; they never start timers, fetch or save a draft. */
export function createCpuPreviewActions(record: (action: string) => void): CpuLabActions {
  return {
    selectStage: (index) => record(`selectStage(${index})`),
    dismissMessage: () => record("dismissMessage"),
    setRow: (index) => record(`setRow(${index})`),
    insertRow: (index) => record(`insertRow(${index})`),
    moveRow: (index, dir) => record(`moveRow(${index}, ${dir})`),
    removeRow: (index) => record(`removeRow(${index})`),
    answerPrompt: async (id, option) => record(`answerPrompt(${id}, ${option})`),
    setByte: (value) => record(`setByte(${value})`),
    step: () => record("step"),
    run: () => record("run"),
    pause: () => record("pause"),
    reset: () => record("reset"),
    selectPhase: (phase) => record(`selectPhase(${phase})`),
    selectCase: (index) => record(`selectCase(${index})`),
    scrubTo: (cycle) => record(`scrubTo(${cycle})`),
    runPublicTests: () => record("runPublicTests"),
    submit: async () => record("submit"),
    replayCounterexample: () => record("replayCounterexample"),
    restoreConflictLocal: () => record("restoreConflictLocal"),
  };
}
