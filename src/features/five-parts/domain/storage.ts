/**
 * Memory vs external storage — a concept model of editing one short essay.
 *
 * 外存 keeps the saved file whether or not there is power; 内存 holds the
 * opened copy only while powered; the CPU works on what is in memory, so a
 * file must be opened (copied in) before it can be processed. Pure data, no
 * React — and NOT a model of real read/write speed or circuitry.
 */

export const ESSAY = [
  "今天的信息技术课上，我们拆开了一台旧电脑。",
  "我找到了内存条，还找到了硬盘。",
  "下次想看看手机里面是什么样子。",
] as const;

export type StorageOp = "open" | "write" | "save" | "cpu-read" | "power-off" | "power-on" | "reset";

/** What just happened — drives the caption and the highlighted card. */
export type StorageEvent =
  | "idle"
  | "open"
  | "write"
  | "save"
  | "cpu-read"
  | "power-off"
  | "power-on"
  /** Any operation tried while the power is off. */
  | "powered-off"
  | "write-empty"
  | "save-empty"
  | "cpu-empty"
  | "essay-done";

export type StorageSpot = "disk" | "memory" | "cpu";

export type StorageState = {
  powerOn: boolean;
  /** Sentences in the file saved on external storage. */
  saved: number;
  /** Sentences in the copy opened in memory; null = memory holds nothing. */
  open: number | null;
  /** Sentences the CPU last read from memory; null = nothing read yet. */
  cpuRead: number | null;
  event: StorageEvent;
};

/**
 * Captions describe what to look at, not the conclusion — the page's
 * question asks the student to put the observation into words.
 */
export const STORAGE_EVENTS: Record<
  StorageEvent,
  { caption: string; highlight: StorageSpot | null }
> = {
  idle: {
    caption: "作文已经保存在外存里。先「打开文件」，再试试写一句、保存、断电。",
    highlight: null,
  },
  open: {
    caption: "打开文件：把外存里的作文复制一份到内存。现在两边各有一份。",
    highlight: "memory",
  },
  write: {
    caption: "写了一句：改动的是内存里的那一份。外存里的作文变了吗？",
    highlight: "memory",
  },
  save: {
    caption: "保存：把内存里的作文写回外存，两边又一样了。",
    highlight: "disk",
  },
  "cpu-read": {
    caption: "CPU 从内存读取作文，数出了句数和字数。",
    highlight: "cpu",
  },
  "power-off": {
    caption: "断电了。看看内存和外存里，各还剩下什么？",
    highlight: "memory",
  },
  "power-on": {
    caption: "重新开机了。想接着写作文，应该先做什么？",
    highlight: null,
  },
  "powered-off": {
    caption: "现在没有电，什么都做不了。先「开机」。",
    highlight: null,
  },
  "write-empty": {
    caption: "内存里没有打开的文件，没法写。先「打开文件」，把作文从外存读进内存。",
    highlight: "memory",
  },
  "save-empty": {
    caption: "内存里没有打开的文件，没有内容可以保存。",
    highlight: "memory",
  },
  "cpu-empty": {
    caption: "内存里没有作文，CPU 拿不到数据。CPU 要处理的数据，得先放进内存。",
    highlight: "cpu",
  },
  "essay-done": {
    caption: "这篇作文已经写完了。可以保存，或者断电试试。",
    highlight: "memory",
  },
};

const EVENT_IDS = new Set<string>(Object.keys(STORAGE_EVENTS));

export function initialStorage(): StorageState {
  // One sentence was written and saved last lesson; nothing is open yet.
  return { powerOn: true, saved: 1, open: null, cpuRead: null, event: "idle" };
}

export function applyStorageOp(state: StorageState, op: StorageOp): StorageState {
  if (op === "reset") return initialStorage();
  if (op === "power-on") {
    return state.powerOn ? state : { ...state, powerOn: true, event: "power-on" };
  }
  if (!state.powerOn) return { ...state, event: "powered-off" };
  switch (op) {
    case "power-off":
      // Memory is volatile: the open copy and anything read from it vanish.
      return { ...state, powerOn: false, open: null, cpuRead: null, event: "power-off" };
    case "open":
      // Already open: reopening would silently drop unsaved edits — no-op.
      if (state.open !== null) return state;
      return { ...state, open: state.saved, cpuRead: null, event: "open" };
    case "write":
      if (state.open === null) return { ...state, event: "write-empty" };
      if (state.open >= ESSAY.length) return { ...state, event: "essay-done" };
      return { ...state, open: state.open + 1, cpuRead: null, event: "write" };
    case "save":
      if (state.open === null) return { ...state, event: "save-empty" };
      return { ...state, saved: state.open, event: "save" };
    case "cpu-read":
      if (state.open === null) return { ...state, event: "cpu-empty" };
      return { ...state, cpuRead: state.open, event: "cpu-read" };
  }
}

/** Characters (punctuation excluded) in the first `lines` sentences. */
export function charCount(lines: number): number {
  return ESSAY.slice(0, lines).reduce(
    (total, sentence) => total + sentence.replace(/[，。]/g, "").length,
    0,
  );
}

/** Bound a restored storage state; the open copy is never older than the file. */
export function sanitizeStorage(raw: unknown): StorageState {
  if (!raw || typeof raw !== "object") return initialStorage();
  const r = raw as Record<string, unknown>;
  const lines = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, Math.min(ESSAY.length, Math.trunc(value)))
      : fallback;
  const powerOn = r.powerOn !== false;
  const saved = lines(r.saved, 1);
  const open = powerOn && typeof r.open === "number" ? Math.max(saved, lines(r.open, saved)) : null;
  const cpuRead =
    open !== null && typeof r.cpuRead === "number" ? Math.min(open, lines(r.cpuRead, 0)) : null;
  const event =
    typeof r.event === "string" && EVENT_IDS.has(r.event) ? (r.event as StorageEvent) : "idle";
  return { powerOn, saved, open, cpuRead, event };
}
