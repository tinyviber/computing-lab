import { encodeInstr, opOperandMeaning } from "../domain/isa.ts";
import type { CpuCase, MachineRun } from "../domain/machine.ts";
import { CPU_CORE_STAGES, CPU_STAGES, cpuStageUnlocked } from "../domain/stages.ts";
import {
  answeredPromptIds,
  blankRowSet,
  editableRowSet,
  guidedComplete,
  nextPrompt,
  programOf,
  stageOf,
  type CpuLessonState,
} from "../lesson/state.ts";
import type { CpuClock, CpuLabViewModel, CpuPlaybackView, CpuStageItem } from "./viewModel.ts";

/** Reconstruct after committed cycles; pending always comes from the same run. */
function displayState(run: MachineRun, cursor: number) {
  const k = Math.min(cursor, run.trace.length);
  const mem = run.initial.mem.slice();
  for (let i = 0; i < k; i += 1) {
    const write = run.trace[i].memWrite;
    if (write) mem[write.addr] = write.value;
  }
  return {
    mem,
    regs: k < run.trace.length ? run.trace[k].regsBefore : run.final.regs,
    pc: k < run.trace.length ? run.trace[k].pc : run.final.pc,
    lastRow: k > 0 ? run.trace[k - 1] : null,
  };
}

/** Pure derivation shared by the live controller and deterministic previews. */
export function createCpuLabViewModel(input: {
  state: CpuLessonState;
  run: MachineRun | null;
  view: CpuPlaybackView;
  clock: CpuClock;
  caseIndex: number;
  replayCase: CpuCase | null;
  publicCases: readonly CpuCase[];
  observedCases: ReadonlySet<number>;
  promptOptionOrders: Readonly<Record<string, readonly number[]>>;
  recordingPrompt: boolean;
  submitting: boolean;
  loadError: string | null;
  submitError: string | null;
}): CpuLabViewModel {
  const { state, run, view, clock, publicCases, replayCase, caseIndex, observedCases } = input;
  const stage = stageOf(state);
  const rows = programOf(state);
  const guided = stage?.guided !== undefined;
  const answered = answeredPromptIds(state);
  const next = nextPrompt(state);
  const cursor = Math.min(view.cursor, run?.trace.length ?? 0);
  const pending = run?.trace[cursor] ?? null;
  const display = run ? displayState(run, cursor) : null;
  const nextDisplay = run && pending ? displayState(run, cursor + 1) : null;
  const phase = view.phase;
  const blocking =
    stage?.guided?.prompts.find(
      (p) => !answered.has(p.id) && p.at !== undefined && cursor >= p.at,
    ) ?? null;
  const pinned = next?.caseIndex !== undefined;
  const observationComplete =
    stage?.track !== "core" || publicCases.every((_, i) => observedCases.has(i));
  const complete = guidedComplete(state);
  const stageItem = (s: (typeof CPU_STAGES)[number]): CpuStageItem => ({
    id: s.id,
    index: s.index,
    title: s.title,
    englishTitle: s.englishTitle,
    active: s.index === state.stageIndex,
    passed: state.passedStages.includes(s.index),
    unlocked: cpuStageUnlocked(state.passedStages, s.index),
  });
  return {
    stage: stage
      ? {
          index: stage.index,
          title: stage.title,
          englishTitle: stage.englishTitle,
          description: stage.description,
          task: stage.task,
          judgeNote: stage.judgeNote,
          hint: stage.hint,
          takeaway: stage.takeaway,
          passed: state.passedStages.includes(stage.index),
        }
      : null,
    rail: {
      corePassed: CPU_CORE_STAGES.filter((s) => state.passedStages.includes(s.index)).length,
      coreTotal: CPU_CORE_STAGES.length,
      core: CPU_CORE_STAGES.map((s) => ({
        stage: stageItem(s),
        challenges: CPU_STAGES.filter(
          (c) => c.track === "challenge" && c.railAfter === s.index,
        ).map(stageItem),
      })),
      challenges: CPU_STAGES.filter(
        (s) => s.track === "challenge" && s.railAfter === undefined,
      ).map(stageItem),
    },
    feedback: {
      saveStatus: state.saveStatus,
      recommendCalculator: state.calculatorCoreComplete === false,
      message: state.message,
      error: input.loadError ?? input.submitError,
    },
    editor: {
      rows,
      ops: stage?.ops ?? [],
      rowOps: stage?.guided?.rowOps,
      editableRows: guided ? editableRowSet(state) : undefined,
      blankRows: blankRowSet(state),
      activeRow: pending && pending.pc < rows.length ? pending.pc : null,
      disabled: clock === "running",
    },
    guide: stage?.guided
      ? {
          answeredCount: answered.size,
          prompts: stage.guided.prompts.map((p) => {
            const byteGated =
              p.requiresByte !== undefined && state.playgroundByte !== p.requiresByte;
            const isAnswered = answered.has(p.id);
            return {
              id: p.id,
              prompt: p.prompt,
              at: p.at,
              answered: isAnswered,
              next: next?.id === p.id,
              blocking: blocking?.id === p.id,
              reveal: isAnswered ? p.reveal : null,
              byteTarget: byteGated ? (p.requiresByte ?? 0).toString(2).padStart(8, "0") : null,
              options: (input.promptOptionOrders[p.id] ?? p.options.map((_, i) => i)).flatMap(
                (index) => {
                  const option = p.options[index];
                  if (!option) return [];
                  const wrong =
                    state.wrongPick?.promptId === p.id && state.wrongPick.option === index;
                  return [
                    {
                      index,
                      label: option.label,
                      wrong,
                      note: wrong ? (option.note ?? null) : null,
                      disabled: byteGated || input.recordingPrompt,
                    },
                  ];
                },
              ),
            };
          }),
        }
      : null,
    bytePlayground: stage?.guided?.bytePlayground
      ? {
          byte: state.playgroundByte,
          programBytes: rows.map(encodeInstr),
        }
      : null,
    machine:
      stage && run && display
        ? {
            phase,
            cursor,
            cycleLabel: `周期 ${cursor}${cursor >= run.trace.length ? ` / ${run.trace.length}` : ""}`,
            canStep: pending !== null && blocking === null,
            canSelectPhase: pending !== null && blocking === null,
            isRunning: clock === "running",
            runLabel: clock === "paused" || cursor > 0 ? "继续" : "连跑",
            canSelectCase: clock !== "running" && !pinned,
            casePinned: pinned,
            caseValue: replayCase
              ? "replay"
              : Math.min(caseIndex, Math.max(0, publicCases.length - 1)),
            cases: [
              ...publicCases.map((c, value) => ({ value, label: c.name })),
              ...(replayCase ? [{ value: "replay" as const, label: replayCase.name }] : []),
            ],
            blockingNote: blocking
              ? `⏸ 机器停在周期 ${cursor} ——先回答上面「${blocking.prompt.slice(0, 18)}…」再继续走。`
              : null,
            registers: {
              carried: display.lastRow?.carried === true,
              ir: pending && phase !== "fetch" ? pending.ir : null,
              irInFlight: pending && phase === "fetch" ? pending.ir : null,
              mem: stage.index === 3 ? display.mem : undefined,
              nextCarried: pending && phase === "exec" ? pending.carried === true : null,
              nextPc: pending && phase === "exec" ? pending.nextPc : null,
              nextRegs: nextDisplay && phase === "exec" ? nextDisplay.regs : null,
              pc: display.pc,
              pendingRow: stage.index === 3 && pending && phase === "exec" ? pending : null,
              prevPc: display.lastRow?.pc ?? null,
              prevRegs: display.lastRow?.regsBefore ?? null,
              regs: display.regs,
            },
            memory: {
              fetchCell: pending && pending.pc < 16 ? pending.pc : -1,
              inputCell: stage.io?.input,
              mem: display.mem,
              outputCell: stage.io?.output,
              pendingWrite: pending && phase === "exec" ? (pending.memWrite ?? null) : null,
              programRows: rows.length,
              readCell:
                pending &&
                phase === "exec" &&
                opOperandMeaning(pending.decoded.op) === "mem" &&
                pending.decoded.op !== "STORE"
                  ? pending.decoded.operand
                  : null,
              scratchCells: stage.scratchCells,
              writtenCell: display.lastRow?.memWrite?.addr ?? null,
            },
            diagram: {
              inputCell: stage.io?.input,
              outputCell: stage.io?.output,
              op: display.lastRow?.decoded.op ?? null,
              pending,
              phase: pending ? phase : null,
            },
            trace: { run, cursor, visited: view.visited },
          }
        : null,
    submission: {
      canRunPublicTests: publicCases.length > 0,
      canSubmit:
        !input.submitting && rows.length > 0 && (!guided || complete) && observationComplete,
      label: input.submitting ? "判定中…" : "提交判定",
      title: !observationComplete
        ? "先把每份演示数据按时钟走到停机"
        : guided && !complete
          ? "先完成上面的引导任务"
          : undefined,
      note: !observationComplete
        ? `这一关是纯观察——把每份演示数据按时钟走完到停机再提交（已看 ${observedCases.size} / ${publicCases.length} 份）。`
        : guided && !complete
          ? "这一关要先完成上面的引导任务才能提交。"
          : "服务器会用带隐藏数据的用例判定——公开测试只是热身。",
    },
    results: { runOutcome: state.runOutcome, judgeOutcome: state.judgeOutcome },
  };
}
