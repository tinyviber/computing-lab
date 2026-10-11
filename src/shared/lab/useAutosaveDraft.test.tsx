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
  expectedRevisionOf: (stageIndex: number) => number;
  deps?: unknown[];
  onSaving: (stageIndex: number) => void;
  onSaved: (stageIndex: number, revision?: number) => void;
  onError: (stageIndex: number) => void;
  onConflict?: (stageIndex: number) => void;
};

const base = (over: Partial<Params> = {}): Params => ({
  classId: "class-1",
  labId: "lab",
  saveStatus: "dirty",
  stageIndex: 1,
  draftOf: (s) => ({ text: `stage-${s}` }),
  expectedRevisionOf: () => 0,
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

const ok = (applied = true, revision?: number) =>
  new Response(JSON.stringify({ ok: true, applied, revision }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("useAutosaveDraft", () => {
  let calls: {
    url: string;
    body: Record<string, unknown>;
    done: ReturnType<typeof deferred<Response>>;
  }[];

  beforeEach(() => {
    vi.useFakeTimers();
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: unknown, init?: RequestInit) => {
        const done = deferred<Response>();
        calls.push({
          url: String(input),
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
          done,
        });
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

  it("debounces continuous edits into one PUT carrying the expected revision", async () => {
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
    expect(calls[0].body.expectedRevision).toBe(0);

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

  it("serializes same-stage saves behind the in-flight one, never racing itself", async () => {
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
    // 同关卡的第二臂在上一次保存未完成时只能排队 —— 同一设备的两笔写入
    // 若并发携带相同的 expectedRevision 必然自相冲突，绝不能放出去。
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls[0].body.expectedRevision).toBe(0);

    // 第一笔落地（服务器分配 revision 5）：排队臂立即以新期望号重发。
    calls[0].done.resolve(ok(true, 5));
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[1].body.expectedRevision).toBe(5);

    calls[1].done.resolve(ok(true, 6));
    await flush();
    // 被取代的旧臂不回报；只有最终臂的 applied 结果落到 saved。
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(1, 6);
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

  it("never arms the stale dirty flag that survives a class switch", async () => {
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ deps: [1] }),
    });
    // 切班瞬间旧班级关卡仍是 dirty（旧 lesson state 还在屏幕上）：
    // 此时不得在新 classId 下重建定时器、更不能把旧快照 PUT 过去。
    rerender(base({ classId: "class-2", deps: [1] }));
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(fetch).not.toHaveBeenCalled();

    // 新上下文里真正产生的 dirty 仍会正常排程。
    rerender(base({ classId: "class-2", deps: [2] }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls[0].url).toBe("/api/classes/class-2/labs/lab/draft");
  });

  it("drops an in-flight write on class switch even while the screen is still dirty", async () => {
    const onSaved = vi.fn();
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ onSaved }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    // 请求已发出、响应未回就切班，且旧 dirty 仍留在屏幕上：
    // 既不得重排定时器，也不得把迟到的响应记成 saved。
    rerender(base({ classId: "class-2", onSaved }));
    calls[0].done.resolve(ok());
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await flush();
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("reports a rejected write through onConflict only while still latest", async () => {
    const onSaved = vi.fn();
    const onError = vi.fn();
    const onConflict = vi.fn();
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ deps: [1], onSaved, onError, onConflict }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    rerender(base({ deps: [2], onSaved, onError, onConflict }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    // 同关卡第二臂在首个保存未完成时排队 —— 只有一个请求在途。
    expect(fetch).toHaveBeenCalledTimes(1);

    // 已被本地更新臂取代的旧写入被拒只是迟到响应：它把队列里的新臂放出去，
    // 自身静默，不触发冲突。
    calls[0].done.resolve(ok(false, 7));
    await flush();
    expect(onConflict).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
    // 被拒响应携带的服务端 revision 也计入下一笔的 expectedRevision。
    expect(calls[1].body.expectedRevision).toBe(7);

    // 仍是最新臂的写入被拒：服务器上已有更新数据，交给 onConflict 走重取
    // 调和 —— 不得静默挂起、不得报成 saved/error。
    calls[1].done.resolve(ok(false, 8));
    await flush();
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onConflict).toHaveBeenCalledWith(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("carries expectedRevision — the project seed first, then the applied response", async () => {
    const { rerender } = renderHook((p: Params) => useAutosaveDraft(p), {
      initialProps: base({ deps: [1], expectedRevisionOf: () => 2 }),
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    // 项目载入时种下的 lastAppliedRevision 是第一笔的期望值。
    expect(calls[0].body.expectedRevision).toBe(2);

    calls[0].done.resolve(ok(true, 4));
    await flush();
    rerender(base({ deps: [2], expectedRevisionOf: () => 2 }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    // 之后以最近一次 applied 响应���配��的 revision 为期望 —— expectedRevision
    // 在发送时刻计算，arm 与 send 之间落地的保存也会算进来。
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[1].body.expectedRevision).toBe(4);

    // reducer 侧读到更高的 seed（如项目重载）时以它为准。
    calls[1].done.resolve(ok(true, 4));
    await flush();
    rerender(base({ deps: [3], expectedRevisionOf: () => 9 }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(calls[2].body.expectedRevision).toBe(9);
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
