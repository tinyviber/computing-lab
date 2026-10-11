import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutosaveDraft } from "./useAutosaveDraft";

type Draft = { text: string };

type Params = {
  classId: string | undefined;
  labId: string;
  saveStatus: string;
  stageIndex: number;
  draftOf: (stageIndex: number) => Draft | undefined;
  deps?: unknown[];
  onSaving: (stageIndex: number) => void;
  onSaved: (stageIndex: number) => void;
  onError: (stageIndex: number) => void;
};

const base = (over: Partial<Params> = {}): Params => ({
  classId: "class-1",
  labId: "lab",
  saveStatus: "dirty",
  stageIndex: 1,
  draftOf: (s) => ({ text: `stage-${s}` }),
  onSaving: vi.fn(),
  onSaved: vi.fn(),
  onError: vi.fn(),
  ...over,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const ok = (applied = true) =>
  new Response(JSON.stringify({ ok: true, applied }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("useAutosaveDraft", () => {
  let calls: { body: Record<string, unknown>; done: ReturnType<typeof deferred<Response>> }[];

  beforeEach(() => {
    vi.useFakeTimers();
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: unknown, init?: RequestInit) => {
        const done = deferred<Response>();
        calls.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown>, done });
        return done.promise;
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it("debounces continuous edits into one PUT carrying the freshest revision", async () => {
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ deps: [1] }),
    });
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    rerender(base({ deps: [2] }));
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls[0].body.stageIndex).toBe(1);
    expect(typeof calls[0].body.revision).toBe("number");

    calls[0].done.resolve(ok());
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("settles every stage's flag on its own response, whatever order they return", async () => {
    const events: string[] = [];
    const listeners = {
      onSaving: (s: number) => events.push(`saving:${s}`),
      onSaved: (s: number) => events.push(`saved:${s}`),
      onError: (s: number) => events.push(`error:${s}`),
    };
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ ...listeners, deps: [1] }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    rerender(base({ ...listeners, stageIndex: 2, deps: [2] }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[0].body.stageIndex).toBe(1);
    expect(calls[1].body.stageIndex).toBe(2);

    // 乱序返回：stage 2 的响应先到。
    calls[1].done.resolve(ok());
    await flush();
    calls[0].done.resolve(ok());
    await flush();
    expect(events).toEqual(["saving:1", "saving:2", "saved:2", "saved:1"]);
  });

  it("drops the stale response once a newer save for the same stage is in flight", async () => {
    const onSaved = vi.fn();
    const onError = vi.fn();
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ deps: [1], onSaved, onError }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    rerender(base({ deps: [2], onSaved, onError }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    const [first, second] = calls;
    expect(first.body.stageIndex).toBe(1);
    expect(second.body.stageIndex).toBe(1);
    expect(second.body.revision).toBeGreaterThan(first.body.revision as number);

    // 旧请求最后返回：不得覆盖新保存已落定的状态。
    second.done.resolve(ok());
    await flush();
    first.done.resolve(ok());
    await flush();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("never reports a server-dropped stale write as saved", async () => {
    const onSaved = vi.fn();
    renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ onSaved }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    calls[0].done.resolve(ok(false));
    await flush();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("clears armed timers and in-flight reporting on unmount", async () => {
    const onSaved = vi.fn();
    const first = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ onSaved }),
    });
    // 定时器还未触发就卸载：请求根本不该发出。
    first.unmount();
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(fetch).not.toHaveBeenCalled();

    // 请求已发出时卸载：迟到的响应被丢弃。
    const second = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ onSaved }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    second.unmount();
    calls[0].done.resolve(ok());
    await flush();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("drops in-flight reporting when the class changes", async () => {
    const onSaved = vi.fn();
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ onSaved }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    rerender(base({ classId: "class-2", saveStatus: "idle", onSaved }));
    calls[0].done.resolve(ok());
    await flush();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("reports a rejection only while its arm is still current", async () => {
    const onError = vi.fn();
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ deps: [1], onError }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    rerender(base({ deps: [2], onError }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    const [first] = calls;
    first.done.reject(new Error("offline"));
    await flush();
    expect(onError).not.toHaveBeenCalled();

    calls[1].done.reject(new Error("offline"));
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(1);
  });
});
