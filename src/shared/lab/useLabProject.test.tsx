import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLabProject } from "./useLabProject";

type Payload = {
  labId: string;
  currentStage: number;
  passedStages: number[];
  drafts: Record<string, unknown>;
};

type Params = {
  classId: string | undefined;
  labId: string;
  ready: boolean;
  toAction: (project: Payload) => { type: string; project: Payload };
  dispatch: (action: { type: string; project: Payload }) => void;
};

const base = (over: Partial<Params> = {}): Params => ({
  classId: "class-1",
  labId: "lab",
  ready: true,
  toAction: (project) => ({ type: "load", project }),
  dispatch: vi.fn(),
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

const payload = (labId: string): Response =>
  new Response(JSON.stringify({ labId, currentStage: 2, passedStages: [1], drafts: {} }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("useLabProject", () => {
  let calls: { url: string; done: ReturnType<typeof deferred<Response>> }[];

  beforeEach(() => {
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: unknown) => {
        const done = deferred<Response>();
        calls.push({ url: String(input), done });
        return done.promise;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it("dispatches the loaded project", async () => {
    const dispatch = vi.fn();
    renderHook((p: Params) => useLabProject(p), { initialProps: base({ dispatch }) });
    expect(calls[0].url).toBe("/api/classes/class-1/labs/lab/project");
    calls[0].done.resolve(payload("lab"));
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "load",
      project: expect.objectContaining({ labId: "lab" }),
    });
  });

  it("drops a stale response once a newer request has started", async () => {
    const dispatch = vi.fn();
    const { rerender } = renderHook((p: Params) => useLabProject(p), {
      initialProps: base({ dispatch }),
    });
    rerender(base({ classId: "class-2", dispatch }));
    expect(calls).toHaveLength(2);

    // 新请求先回来。
    calls[1].done.resolve(payload("lab"));
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(1);

    // 旧 classId 的迟到响应被丢弃，不得覆盖新班级状态。
    calls[0].done.resolve(payload("lab"));
    await flush();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("drops the response of a request whose component unmounted", async () => {
    const dispatch = vi.fn();
    const { unmount } = renderHook((p: Params) => useLabProject(p), {
      initialProps: base({ dispatch }),
    });
    unmount();
    calls[0].done.resolve(payload("lab"));
    await flush();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("surfaces load errors for the current request only", async () => {
    const dispatch = vi.fn();
    const { result, rerender } = renderHook((p: Params) => useLabProject(p), {
      initialProps: base({ dispatch }),
    });
    rerender(base({ classId: "class-2", dispatch }));

    calls[0].done.resolve(new Response(JSON.stringify({ error: "not-a-member" }), { status: 403 }));
    await flush();
    expect(result.current.loadError).toBeNull();

    calls[1].done.resolve(new Response(JSON.stringify({ error: "not-a-member" }), { status: 403 }));
    await flush();
    expect(result.current.loadError).toBe("你不在这个班级里。");
  });
});
