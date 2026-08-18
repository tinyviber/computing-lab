export type Utf8ScenarioId = "ascii" | "accent" | "cjk" | "emoji" | "mixed";

export type Utf8Scenario = {
  id: Utf8ScenarioId;
  title: string;
  text: string;
  codePoints: readonly number[];
};

export type Utf8Branch = "1-byte" | "2-byte" | "3-byte" | "4-byte";

export type Utf8ByteEvidence = {
  decimal: number;
  binary: string;
};

export type Utf8ScalarEvidence = {
  codePoint: number;
  character: string;
  branch: Utf8Branch;
  codePointBinary: string;
  template: string;
  bytes: readonly Utf8ByteEvidence[];
  explanation: string;
};

export type Utf8Status = "running" | "complete";

export type Utf8Machine = {
  nextIndex: number;
  status: Utf8Status;
  bytes: readonly number[];
};

export type Utf8Snapshot = Utf8Machine;

export type Utf8Frame = {
  index: number;
  before: Utf8Snapshot;
  after: Utf8Snapshot;
  evidence: Utf8ScalarEvidence;
};

export type Utf8StepResult = {
  machine: Utf8Machine;
  frame?: Utf8Frame;
  done: boolean;
};

const MAX_CODE_POINT = 0x10ffff;
const SURROGATE_START = 0xd800;
const SURROGATE_END = 0xdfff;

function cloneBytes(bytes: readonly number[]): number[] {
  return [...bytes];
}

function cloneMachine(machine: Utf8Machine): Utf8Machine {
  return { ...machine, bytes: cloneBytes(machine.bytes) };
}

function snapshot(machine: Utf8Machine): Utf8Snapshot {
  return cloneMachine(machine);
}

function byteEvidence(bytes: readonly number[]): Utf8ByteEvidence[] {
  return bytes.map((decimal) => ({ decimal, binary: decimal.toString(2).padStart(8, "0") }));
}

export function assertCodePoint(codePoint: number): void {
  if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > MAX_CODE_POINT) {
    throw new Error(`Invalid Unicode code point: ${codePoint}.`);
  }
  if (codePoint >= SURROGATE_START && codePoint <= SURROGATE_END) {
    throw new Error(
      `UTF-16 surrogate code point is not a Unicode scalar: U+${codePoint.toString(16)}.`,
    );
  }
}

export function assertUtf8Scenario(scenario: Utf8Scenario): void {
  if (!scenario.title.trim() || scenario.text.length === 0) {
    throw new Error("UTF-8 scenarios need a title and non-empty text.");
  }
  if (scenario.codePoints.length === 0) throw new Error("UTF-8 scenarios need code points.");
  const derived = [...scenario.text].map((character) => character.codePointAt(0)!);
  if (
    derived.length !== scenario.codePoints.length ||
    derived.some((value, index) => value !== scenario.codePoints[index])
  ) {
    throw new Error("Scenario code points must match its text.");
  }
  scenario.codePoints.forEach(assertCodePoint);
}

export function encodeCodePoint(codePoint: number): Utf8ScalarEvidence {
  assertCodePoint(codePoint);
  const character = String.fromCodePoint(codePoint);
  const codePointBinary = codePoint.toString(2).padStart(21, "0");
  if (codePoint <= 0x7f) {
    const bytes = [codePoint];
    return {
      codePoint,
      character,
      branch: "1-byte",
      codePointBinary,
      template: "0xxxxxxx",
      bytes: byteEvidence(bytes),
      explanation: `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")} fits directly in one 7-bit byte.`,
    };
  }
  if (codePoint <= 0x7ff) {
    const bytes = [0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f)];
    return {
      codePoint,
      character,
      branch: "2-byte",
      codePointBinary,
      template: "110xxxxx 10xxxxxx",
      bytes: byteEvidence(bytes),
      explanation: "The scalar is split into 5 payload bits and 6 payload bits across two bytes.",
    };
  }
  if (codePoint <= 0xffff) {
    const bytes = [
      0xe0 | (codePoint >> 12),
      0x80 | ((codePoint >> 6) & 0x3f),
      0x80 | (codePoint & 0x3f),
    ];
    return {
      codePoint,
      character,
      branch: "3-byte",
      codePointBinary,
      template: "1110xxxx 10xxxxxx 10xxxxxx",
      bytes: byteEvidence(bytes),
      explanation: "The scalar is split into 4, 6, and 6 payload bits across three bytes.",
    };
  }
  const bytes = [
    0xf0 | (codePoint >> 18),
    0x80 | ((codePoint >> 12) & 0x3f),
    0x80 | ((codePoint >> 6) & 0x3f),
    0x80 | (codePoint & 0x3f),
  ];
  return {
    codePoint,
    character,
    branch: "4-byte",
    codePointBinary,
    template: "11110xxx 10xxxxxx 10xxxxxx 10xxxxxx",
    bytes: byteEvidence(bytes),
    explanation: "The scalar is split into 3, 6, 6, and 6 payload bits across four bytes.",
  };
}

export function createUtf8Machine(scenario: Utf8Scenario): Utf8Machine {
  assertUtf8Scenario(scenario);
  return { nextIndex: 0, status: "running", bytes: [] };
}

export function stepUtf8(machine: Utf8Machine, scenario: Utf8Scenario): Utf8StepResult {
  assertUtf8Scenario(scenario);
  if (machine.status === "complete") return { machine, done: true };
  const codePoint = scenario.codePoints[machine.nextIndex];
  if (codePoint === undefined) throw new Error("A running UTF-8 machine needs a next code point.");
  const before = snapshot(machine);
  const evidence = encodeCodePoint(codePoint);
  const nextIndex = machine.nextIndex + 1;
  const next: Utf8Machine = {
    nextIndex,
    status: nextIndex >= scenario.codePoints.length ? "complete" : "running",
    bytes: [...machine.bytes, ...evidence.bytes.map((byte) => byte.decimal)],
  };
  const after = snapshot(next);
  return {
    machine: next,
    frame: { index: machine.nextIndex, before, after, evidence },
    done: next.status === "complete",
  };
}

export function runUtf8(scenario: Utf8Scenario): { machine: Utf8Machine; frames: Utf8Frame[] } {
  let machine = createUtf8Machine(scenario);
  const frames: Utf8Frame[] = [];
  for (let index = 0; index < scenario.codePoints.length; index += 1) {
    const result = stepUtf8(machine, scenario);
    if (!result.frame) throw new Error("A running UTF-8 step must produce a frame.");
    frames.push(result.frame);
    machine = result.machine;
  }
  return { machine, frames };
}
