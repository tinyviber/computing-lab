import type { InstrRow, OpName } from "../domain/isa.ts";
import type { MachineRun, RegPair, TraceRow } from "../domain/machine.ts";
import type { CpuCounterexample, CpuJudgeResult } from "../domain/protocol.ts";
import type { PublicRunOutcome, SaveStatus } from "../lesson/state.ts";

/** Presentation contract: no reducer, network client, timers or mutable engine. */
export type CpuPhase = "fetch" | "decode" | "exec";
export type CpuClock = "idle" | "running" | "paused";
export type CpuPlaybackView = { cursor: number; visited: number; phase: CpuPhase };

export type CpuStageItem = Readonly<{
  id: string;
  index: number;
  title: string;
  englishTitle: string;
  active: boolean;
  passed: boolean;
  unlocked: boolean;
}>;

export type CpuGuideViewModel = Readonly<{
  answeredCount: number;
  prompts: readonly Readonly<{
    id: string;
    prompt: string;
    at?: number;
    answered: boolean;
    next: boolean;
    blocking: boolean;
    reveal: string | null;
    byteTarget: string | null;
    options: readonly Readonly<{
      index: number;
      label: string;
      wrong: boolean;
      note: string | null;
      disabled: boolean;
    }>[];
  }>[];
}>;

export type CpuLabViewModel = Readonly<{
  stage: Readonly<{
    index: number;
    title: string;
    englishTitle: string;
    description: string;
    task: string;
    judgeNote: string;
    hint: string;
    takeaway: string;
    passed: boolean;
  }> | null;
  rail: Readonly<{
    corePassed: number;
    coreTotal: number;
    core: readonly Readonly<{ stage: CpuStageItem; challenges: readonly CpuStageItem[] }>[];
    challenges: readonly CpuStageItem[];
  }>;
  feedback: Readonly<{
    saveStatus: SaveStatus;
    /** A pre-conflict local draft of this stage is recoverable. */
    conflictLocalAvailable: boolean;
    recommendCalculator: boolean;
    message: string | null;
    error: string | null;
  }>;
  editor: Readonly<{
    rows: InstrRow[];
    ops: readonly OpName[];
    rowOps?: readonly OpName[];
    editableRows?: ReadonlySet<number>;
    blankRows: ReadonlySet<number>;
    activeRow: number | null;
    disabled: boolean;
  }>;
  guide: CpuGuideViewModel | null;
  bytePlayground: Readonly<{ byte: number; programBytes: number[] }> | null;
  machine: Readonly<{
    phase: CpuPhase;
    cursor: number;
    cycleLabel: string;
    canStep: boolean;
    canSelectPhase: boolean;
    isRunning: boolean;
    runLabel: string;
    canSelectCase: boolean;
    casePinned: boolean;
    caseValue: number | "replay";
    cases: readonly Readonly<{ value: number | "replay"; label: string }>[];
    blockingNote: string | null;
    registers: {
      regs: RegPair;
      prevRegs: RegPair | null;
      nextRegs: RegPair | null;
      pc: number;
      prevPc: number | null;
      nextPc: number | null;
      ir: number | null;
      irInFlight: number | null;
      carried: boolean;
      nextCarried: boolean | null;
      pendingRow: TraceRow | null;
      mem?: readonly number[];
    };
    memory: {
      mem: number[];
      programRows: number;
      fetchCell: number;
      readCell: number | null;
      writtenCell: number | null;
      pendingWrite: { addr: number; value: number } | null;
      scratchCells: readonly number[];
      inputCell?: number;
      outputCell?: number;
    };
    diagram: {
      op: OpName | null;
      pending: TraceRow | null;
      phase: CpuPhase | null;
      inputCell?: number;
      outputCell?: number;
    };
    /** Keep the full trace: TraceRows reads the next row's regsBefore. */
    trace: { run: MachineRun; cursor: number; visited: number };
  }> | null;
  submission: Readonly<{
    canRunPublicTests: boolean;
    canSubmit: boolean;
    label: string;
    title?: string;
    note: string;
  }>;
  results: Readonly<{
    runOutcome: PublicRunOutcome | null;
    judgeOutcome: CpuJudgeResult | null;
  }>;
}>;

/** User intent only. The controller owns action mapping and teaching guards. */
export type CpuLabActions = {
  selectStage(index: number): void;
  dismissMessage(): void;
  setRow(index: number, patch: { op?: OpName; reg?: 0 | 1; operand?: number }): void;
  insertRow(index: number): void;
  moveRow(index: number, direction: -1 | 1): void;
  removeRow(index: number): void;
  answerPrompt(promptId: string, option: number): Promise<void>;
  setByte(value: number): void;
  step(): void;
  run(): void;
  pause(): void;
  reset(): void;
  selectPhase(phase: CpuPhase): void;
  selectCase(index: number): void;
  scrubTo(cycle: number): void;
  runPublicTests(): void;
  submit(): Promise<void>;
  replayCounterexample(counterexample: CpuCounterexample): void;
  /** Swap the reconciled (server) draft back for the pre-conflict local copy. */
  restoreConflictLocal(): void;
};

export type CpuWorkspaceProps = { model: CpuLabViewModel; actions: CpuLabActions };
