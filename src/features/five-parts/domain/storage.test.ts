import { describe, expect, it } from "vitest";
import { PHONE_STEP_COUNT, PHONE_STEPS, phoneTags } from "./phone.ts";
import {
  applyStorageOp,
  charCount,
  ESSAY,
  initialStorage,
  sanitizeStorage,
  type StorageOp,
  type StorageState,
} from "./storage.ts";

const run = (ops: StorageOp[], from: StorageState = initialStorage()) =>
  ops.reduce(applyStorageOp, from);

describe("memory vs storage model", () => {
  it("starts with the saved file on storage and nothing in memory", () => {
    expect(initialStorage()).toEqual({
      powerOn: true,
      saved: 1,
      open: null,
      cpuRead: null,
      event: "idle",
    });
  });

  it("opening copies the file into memory; writing only changes memory", () => {
    const opened = run(["open"]);
    expect(opened.open).toBe(1);
    const written = run(["write"], opened);
    expect(written.open).toBe(2);
    expect(written.saved).toBe(1);
  });

  it("power-off clears memory but keeps what was saved", () => {
    const off = run(["open", "write", "save", "write", "cpu-read", "power-off"]);
    expect(off.powerOn).toBe(false);
    expect(off.open).toBeNull();
    expect(off.cpuRead).toBeNull();
    expect(off.saved).toBe(2);
    expect(off.event).toBe("power-off");
  });

  it("nothing works without power until it comes back; then memory starts empty", () => {
    const off = run(["open", "power-off"]);
    expect(run(["open"], off)).toMatchObject({ open: null, event: "powered-off" });
    const on = run(["power-on"], off);
    expect(on).toMatchObject({ powerOn: true, open: null, event: "power-on" });
  });

  it("the CPU can only read what is in memory", () => {
    expect(run(["cpu-read"])).toMatchObject({ cpuRead: null, event: "cpu-empty" });
    const read = run(["open", "write", "cpu-read"]);
    expect(read).toMatchObject({ cpuRead: 2, event: "cpu-read" });
    expect(charCount(2)).toBeGreaterThan(charCount(1));
  });

  it("refuses writes and saves with nothing open, and stops at the essay's end", () => {
    expect(run(["write"]).event).toBe("write-empty");
    expect(run(["save"]).event).toBe("save-empty");
    const full = run(["open", ...ESSAY.map(() => "write" as const)]);
    expect(full.open).toBe(ESSAY.length);
    expect(full.event).toBe("essay-done");
  });

  it("re-opening never silently discards unsaved edits", () => {
    const edited = run(["open", "write"]);
    expect(run(["open"], edited)).toBe(edited);
  });

  it("sanitizes restored state at the boundary", () => {
    expect(sanitizeStorage(null)).toEqual(initialStorage());
    expect(
      sanitizeStorage({ powerOn: true, saved: 99, open: 1, cpuRead: 9, event: "bogus" }),
    ).toEqual({
      powerOn: true,
      saved: ESSAY.length,
      open: ESSAY.length,
      cpuRead: 3,
      event: "idle",
    });
    // Memory never survives a stored power-off.
    expect(sanitizeStorage({ powerOn: false, saved: 2, open: 2 }).open).toBeNull();
  });
});

describe("phone photo walkthrough", () => {
  it("lights the touch screen as input first and as output later", () => {
    expect(PHONE_STEP_COUNT).toBe(5);
    expect(PHONE_STEPS[1].highlight).toContain("touch");
    expect(PHONE_STEPS[4].highlight).toEqual(["touch"]);
    expect(phoneTags(1).touch).toEqual(["输入设备"]);
    expect(phoneTags(PHONE_STEP_COUNT).touch).toEqual(["输入设备", "输出设备"]);
  });

  it("maps running memory to 内存 and storage space to 外存", () => {
    const tags = phoneTags(PHONE_STEP_COUNT);
    expect(tags.ram).toEqual(["存储器 · 内存"]);
    expect(tags.storage).toEqual(["存储器 · 外存"]);
    expect(phoneTags(0).touch).toEqual([]);
  });
});
