import { act, render } from "@testing-library/react";
import { useReducer, type Dispatch } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DecodingDraft } from "../../features/decoding/domain/protocol";
import {
  createDecodingLessonState,
  emptyDraft,
  transitionDecodingLesson,
  type DecodingLessonAction,
  type DecodingLessonState,
} from "../../features/decoding/lesson/state";
import { statusForStage } from "./saveStatus";
import { useAutosaveDraft } from "./useAutosaveDraft";
import { useLabProject } from "./useLabProject";

/**
 * Save-conflict recovery end to end, driven through the REAL decoding lesson
 * reducer: a PUT the server refuses (`applied: false`) must reconcile ONLY
 * the conflicted stage — the other stages' unsaved local drafts and their
 * save flags survive, and the conflict flag lands on the stage it belongs
 * to. The final reducer state is what is asserted.
 */

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

const decodingDraft = (code: string): DecodingDraft => ({ ...emptyDraft(), code });

type LabState = DecodingLessonState;

describe("save conflict recovery", () => {
  let calls: {
    url: string;
    method: string;
    body: Record<string, unknown> | null;
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
          method: init?.method ?? "GET",
          body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
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

  it("reconciles only the conflicted stage through the real reducer", async () => {
    // The probe wires the hooks exactly like the lab pages do, but keeps the
    // lesson reducer in the open so the test can seed edits and read the
    // final state after the conflict resolves.
    const exposed: { state: LabState; dispatch: Dispatch<DecodingLessonAction> | null } = {
      state: createDecodingLessonState(1),
      dispatch: null,
    };

    function Probe() {
      const [state, dispatch] = useReducer(transitionDecodingLesson, undefined, () =>
        createDecodingLessonState(1),
      );
      exposed.state = state;
      exposed.dispatch = dispatch;
      const { fetchProject, projectLoaded } = useLabProject<
        DecodingDraft,
        Record<string, never>,
        DecodingLessonAction
      >({
        classId: "class-1",
        labId: "decoding",
        ready: true,
        toAction: (project) => ({
          type: "load-project",
          currentStage: project.currentStage,
          passedStages: project.passedStages,
          draftRevisions: project.draftRevisions,
          drafts: Object.fromEntries(
            Object.entries(project.drafts ?? {}).map(([key, value]) => [Number(key), value]),
          ),
          payloads: {},
        }),
        dispatch,
      });
      useAutosaveDraft<DecodingDraft>({
        classId: "class-1",
        labId: "decoding",
        saveStatus: projectLoaded
          ? statusForStage(state.saveStatusByStage, state.stageIndex)
          : "idle",
        stageIndex: state.stageIndex,
        draftOf: (s) => state.drafts[s],
        expectedRevisionOf: (s) => state.draftRevisions[s] ?? 0,
        onSaving: (s) => dispatch({ type: "mark-saving", stageIndex: s }),
        onSaved: (s, revision) => dispatch({ type: "mark-saved", stageIndex: s, revision }),
        onError: (s) => dispatch({ type: "mark-save-error", stageIndex: s }),
        onConflict: (s) => {
          void fetchProject().then((project) => {
            if (!project) {
              dispatch({ type: "mark-save-conflict", stageIndex: s });
              return;
            }
            dispatch({
              type: "resolve-save-conflict",
              stageIndex: s,
              draft: project.drafts?.[s] ?? emptyDraft(),
              revision: project.draftRevisions?.[s],
            });
          });
        },
      });
      return null;
    }

    render(<Probe />);
    // 初始 project GET：stage 1 已通过（stage 2 解锁），服务端无草稿。
    calls[0].done.resolve(
      json({ labId: "decoding", currentStage: 1, passedStages: [1], drafts: {} }),
    );
    await flush();

    const dispatch = (a: DecodingLessonAction) =>
      act(() => {
        exposed.dispatch?.(a);
      });

    // Stage 1 留下一个本地未保存草稿，autosave 已在途 → flag "saving"。
    dispatch({ type: "set-code", code: "mine-1" });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    const put1 = calls.find((c) => c.method === "PUT");
    expect(put1?.body?.stageIndex).toBe(1);
    expect(put1?.body?.expectedRevision).toBe(0);

    // 切到 stage 2 再编辑 —— stage 2 的保存随后在途。
    dispatch({ type: "select-stage", stageIndex: 2 });
    dispatch({ type: "set-code", code: "local-2" });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    const put2 = calls.filter((c) => c.method === "PUT")[1];
    expect(put2?.body?.stageIndex).toBe(2);

    // 服务器上另一设备已写入更新的数据（revision 7）：本机写入被拒。
    put2?.done.resolve(json({ ok: true, applied: false, revision: 7 }));
    await flush();
    // onConflict → fetchProject：重取只为调和，不再走整图 load-project。
    const refetch = calls.find((c, i) => i > 0 && c.method === "GET");
    expect(refetch?.url).toBe("/api/classes/class-1/labs/decoding/project");
    refetch?.done.resolve(
      json({
        labId: "decoding",
        currentStage: 1,
        passedStages: [1],
        drafts: { "2": decodingDraft("server-2") },
        draftRevisions: { "2": 7 },
      }),
    );
    await flush();

    // 终态断言（真实 reducer，不是 dispatch 顺序）：
    // - stage 2 换成服务端草稿、flag 落定 conflict、revision 记录服务端值；
    // - stage 1 的本地草稿与 flag 原样保留 —— 旧的 load-project 路径会把
    //   它们一起清掉。
    expect(exposed.state.drafts[2]?.code).toBe("server-2");
    expect(statusForStage(exposed.state.saveStatusByStage, 2)).toBe("conflict");
    expect(exposed.state.draftRevisions[2]).toBe(7);
    expect(exposed.state.drafts[1]?.code).toBe("mine-1");
    expect(statusForStage(exposed.state.saveStatusByStage, 1)).toBe("saving");
    expect(exposed.state.stageIndex).toBe(2);

    // stage 1 的在途保存随后落地：flag 收敛到 saved，revision 也记入。
    put1?.done.resolve(json({ ok: true, applied: true, revision: 3 }));
    await flush();
    expect(statusForStage(exposed.state.saveStatusByStage, 1)).toBe("saved");
    expect(exposed.state.draftRevisions[1]).toBe(3);
    // 冲突过的 stage 2 不受影响。
    expect(statusForStage(exposed.state.saveStatusByStage, 2)).toBe("conflict");
    expect(exposed.state.drafts[2]?.code).toBe("server-2");
  });
});
