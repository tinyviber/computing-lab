import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutosaveDraft } from "./useAutosaveDraft";
import { useLabProject } from "./useLabProject";

/**
 * The save-conflict recovery path end to end: a PUT the server drops as
 * `applied: false` must not leave the stage flag hanging. The page wiring —
 * onConflict → useLabProject.reload() → load-project → mark-save-conflict —
 * refetches the newer state the server holds and only then settles the flag.
 */

type Action = { type: string; stageIndex?: number };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("save conflict recovery", () => {
  let calls: { url: string; method: string; done: ReturnType<typeof deferred<Response>> }[];

  beforeEach(() => {
    vi.useFakeTimers();
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: unknown, init?: RequestInit) => {
        const done = deferred<Response>();
        calls.push({ url: String(input), method: init?.method ?? "GET", done });
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

  it("rejected latest write triggers a refetch, then marks the conflict", async () => {
    const dispatched: Action[] = [];

    function Probe() {
      const { reload } = useLabProject({
        classId: "class-1",
        labId: "lab",
        ready: true,
        toAction: (project: unknown) => ({ type: "load-project", project }),
        dispatch: (action: Action) => dispatched.push(action),
      });
      useAutosaveDraft<{ text: string }>({
        classId: "class-1",
        labId: "lab",
        saveStatus: "dirty",
        stageIndex: 1,
        draftOf: () => ({ text: "mine" }),
        onSaving: (s) => dispatched.push({ type: "mark-saving", stageIndex: s }),
        onSaved: (s) => dispatched.push({ type: "mark-saved", stageIndex: s }),
        onError: (s) => dispatched.push({ type: "mark-save-error", stageIndex: s }),
        onConflict: (s) => {
          void reload().finally(() =>
            dispatched.push({ type: "mark-save-conflict", stageIndex: s }),
          );
        },
      });
      return null;
    }

    render(<Probe />);
    // 初始 project GET 先回。
    calls[0].done.resolve(json({ labId: "lab", currentStage: 1, passedStages: [], drafts: {} }));
    await flush();
    expect(calls).toHaveLength(1);

    // autosave 发出 PUT，服务器持有更新写入 → applied:false。
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url).toBe("/api/classes/class-1/labs/lab/draft");
    put?.done.resolve(json({ ok: true, applied: false }));
    await flush();

    // onConflict → reload()：重新 GET /project 拿回服务器上更新的数据。
    const get = calls.find((c, i) => i > 0 && c.method === "GET");
    expect(get?.url).toBe("/api/classes/class-1/labs/lab/project");
    get?.done.resolve(
      json({ labId: "lab", currentStage: 1, passedStages: [], drafts: { "1": { text: "newer" } } }),
    );
    await flush();

    // 状态先调和到服务器数据，再把 flag 落成 conflict —— 不悬空、不假报 saved。
    expect(dispatched.map((a) => a.type)).toEqual([
      "load-project",
      "mark-saving",
      "load-project",
      "mark-save-conflict",
    ]);
  });
});
