import { act, render } from "@testing-library/react";
import { useReducer, type Dispatch } from "react";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "../../../../server/auth/password.ts";
import { createSession } from "../../../../server/auth/session.ts";
import { newId, openMemoryDb } from "../../../../server/db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../../../../server/http/context.ts";
import { calculatorRoutes } from "../../../../server/routes/calculator.ts";
import { api } from "../../../shared/api/client.ts";
import { statusForStage } from "../../../shared/lab/saveStatus.ts";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft.ts";
import { reconcileConflictedStage, useLabProject } from "../../../shared/lab/useLabProject.ts";
import { halfAdderGraph } from "../domain/fixtures.ts";
import type { CircuitGraph, ComponentDef } from "../domain/graph.ts";
import type { CalculatorJudgeResult } from "../domain/protocol.ts";
import {
  createCalculatorLessonState,
  graphOf,
  transitionCalculatorLesson,
  type CalculatorLessonAction,
  type CalculatorLessonState,
} from "./state.ts";

/**
 * Component-library autosave lifecycle regressions, driven end to end through
 * the REAL calculator lesson reducer, the REAL autosave hook, and a REAL Hono
 * server backed by an in-memory SQLite db. fetch is stubbed only to control
 * delivery order: every request runs against the server the moment it is
 * issued (`serverWork`), while the client sees the response only when the
 * test delivers it — the exact late-ack / refused / out-of-order response
 * orderings the review reported:
 *
 *  T1 — another stage's save ack must not clear the library's unconfirmed
 *       edits: a save confirms only the edit seq it actually carried, so the
 *       stage-2 PUT sent after stage-1's ack still carries component B.
 *  T2 — a send blocked by the project-wide components fence keeps its stage's
 *       pending save task; once the library resyncs the parked arm re-sends
 *       and the stage's draft persists.
 *  T3 — a stale autosave response must not regress componentsRevision after
 *       a judge already adopted a newer (snapshot, revision) pair.
 */

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

type Call = {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
  serverWork: Promise<Response>;
  done: ReturnType<typeof deferred<Response>>;
};

const AUTOSAVE_DELAY_MS = 1500;

describe("calculator component-library autosave lifecycle", () => {
  let calls: Call[];
  let app: Hono<{ Variables: AppVariables }>;
  let classId: string;
  let cookie: string;
  let exposed: {
    state: CalculatorLessonState;
    dispatch: Dispatch<CalculatorLessonAction> | null;
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    calls = [];
    const db = openMemoryDb();
    classId = newId();
    db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
      classId,
      "实验班",
      "invite-1",
    );
    const studentId = newId();
    db.prepare(
      "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
    ).run(studentId, "stu-1", "stu-1", await hashPassword("pass"), "user");
    db.prepare("INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, ?)").run(
      newId(),
      classId,
      studentId,
      "student",
    );
    app = new Hono<{ Variables: AppVariables }>();
    app.use("/api/*", attachDb(db), attachSession());
    app.route("/api/classes/:classId/labs/calculator", calculatorRoutes());
    cookie = `lab_session=${createSession(db, studentId).id}`;
    exposed = { state: createCalculatorLessonState(1), dispatch: null };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: unknown, init?: RequestInit) => {
        const done = deferred<Response>();
        const request = new Request(new URL(String(input), "http://lab.test"), {
          method: init?.method ?? "GET",
          headers: { "content-type": "application/json", cookie },
          body: init?.body ? String(init.body) : undefined,
        });
        const serverWork = Promise.resolve(app.fetch(request));
        calls.push({
          url: String(input),
          method: init?.method ?? "GET",
          body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
          serverWork,
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

  const deliver = async (call: Call) => {
    call.done.resolve(await call.serverWork);
    await flush();
  };

  const advance = async () => {
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });
  };

  const dispatch = (action: CalculatorLessonAction) =>
    act(() => {
      exposed.dispatch?.(action);
    });

  const componentNames = () => exposed.state.unlockedSubmodules.map((component) => component.name);

  // The probe wires the hooks exactly like CalculatorLabPage does, but keeps
  // the lesson reducer in the open so the test can seed edits and read the
  // final state.
  function Probe() {
    const [state, dispatch] = useReducer(transitionCalculatorLesson, undefined, () =>
      createCalculatorLessonState(1),
    );
    exposed.state = state;
    exposed.dispatch = dispatch;
    const graph = graphOf(state);
    const { projectLoaded, fetchProject } = useLabProject<
      CircuitGraph,
      { unlockedSubmodules: ComponentDef[] },
      CalculatorLessonAction
    >({
      classId,
      labId: "calculator",
      ready: true,
      toAction: (project) => ({
        type: "load-project",
        currentStage: project.currentStage,
        passedStages: project.passedStages,
        unlockedSubmodules: project.unlockedSubmodules,
        draftRevisions: project.draftRevisions,
        componentsRevision: project.draftRevisions?.components ?? 0,
        drafts: Object.fromEntries(
          Object.entries(project.drafts ?? {}).map(([key, value]) => [Number(key), value]),
        ),
      }),
      dispatch,
    });
    useAutosaveDraft<CircuitGraph>({
      classId,
      labId: "calculator",
      saveStatus: projectLoaded
        ? statusForStage(state.saveStatusByStage, state.stageIndex)
        : "idle",
      stageIndex: state.stageIndex,
      draftOf: () => graph,
      bodyFor: (index, draft) => ({
        stageIndex: index,
        graph: draft,
        ...(state.componentsChanged ? { components: state.unlockedSubmodules } : {}),
      }),
      deps: [graph, state.unlockedSubmodules],
      expectedRevisionOf: (s) => state.draftRevisions[s] ?? 0,
      expectedComponentsRevisionOf: () => state.componentsRevision,
      componentsSeqOf: () => state.componentsEditSeq,
      onSaving: (s) => dispatch({ type: "mark-saving", stageIndex: s }),
      onSaved: (s, revision, componentsRevision, componentsSeq) =>
        dispatch({
          type: "mark-saved",
          stageIndex: s,
          revision,
          componentsRevision,
          componentsSeq,
        }),
      onError: (s) => dispatch({ type: "mark-save-error", stageIndex: s }),
      onConflict: (s) =>
        reconcileConflictedStage<CircuitGraph, { unlockedSubmodules: ComponentDef[] }>({
          fetchProject,
          stageIndex: s,
          onResolved: (stageIndex, project) =>
            dispatch({
              type: "resolve-save-conflict",
              stageIndex,
              draft: project.drafts?.[stageIndex],
              revision: project.draftRevisions?.[stageIndex],
              unlockedSubmodules: project.unlockedSubmodules,
              componentsRevision: project.draftRevisions?.components,
            }),
          onSyncError: (stageIndex) => dispatch({ type: "mark-save-sync-error", stageIndex }),
        }),
    });
    return null;
  }

  /** A gate wired between input pin A and the given output pin, then
   *  componentized — the smallest legal "create a library component" edit. */
  const createComponent = (name: string, outputPin: string) => {
    dispatch({ type: "add-node", kind: "not", x: 220, y: 120 });
    const gate = exposed.state.selectedNodeId!;
    dispatch({ type: "start-wire", from: { node: "in-A", port: "out" } });
    dispatch({ type: "complete-wire", to: { node: gate, port: "in" } });
    dispatch({ type: "start-wire", from: { node: gate, port: "out" } });
    dispatch({ type: "complete-wire", to: { node: `out-${outputPin}`, port: "in" } });
    dispatch({
      type: "componentize-selection",
      selectedIds: [gate],
      name,
      inputNames: ["I"],
      outputNames: ["O"],
    });
  };

  const selectStage = (stageIndex: number) =>
    dispatch({ type: "select-stage", stageIndex, force: true });

  /** The student submits the judge exactly like the page's onSubmit. */
  const submitJudge = async (stageIndex: number, graph: CircuitGraph) => {
    const result = await api.post<CalculatorJudgeResult>(
      `/api/classes/${classId}/labs/calculator/judge`,
      { stageIndex, graph, components: exposed.state.unlockedSubmodules },
    );
    act(() => {
      exposed.dispatch?.({
        type: "judge-result",
        outcome: {
          score: result.score,
          total: result.total,
          passed: result.passed,
          categories: result.testSummary.categories,
          counterexample: result.testSummary.counterexample,
          passedStages: result.passedStages,
          error: result.testSummary.error,
          unlockedComponent: result.unlockedComponent,
          unlockedSubmodules: result.unlockedSubmodules,
          componentsRevision: result.componentsRevision,
        },
      });
    });
  };

  /** A second device writing directly against the server — its response is
   *  never delivered to this client. */
  const foreignPut = (body: Record<string, unknown>) =>
    app.fetch(
      new Request(`http://lab.test/api/classes/${classId}/labs/calculator/draft`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  const projectPayload = async () => {
    const response = await app.fetch(
      new Request(`http://lab.test/api/classes/${classId}/labs/calculator/project`, {
        headers: { cookie },
      }),
    );
    return (await response.json()) as {
      drafts: Record<string, CircuitGraph>;
      draftRevisions: Record<string, number>;
      unlockedSubmodules: ComponentDef[];
    };
  };

  const puts = () => calls.filter((call) => call.method === "PUT");

  const loadProject = async () => {
    render(<Probe />);
    // Initial GET /project — an empty project for the new student.
    await deliver(calls[0]);
    expect(componentNames()).toEqual([]);
  };

  it("T1: a stage-1 ack confirms only the library edits it carried, so stage-2's save still carries B", async () => {
    await loadProject();

    // Stage 1: create component A — autosave leaves with the library at seq 1.
    createComponent("NotA", "Y");
    expect(exposed.state.componentsEditSeq).toBe(1);
    await advance();
    const put1 = puts()[0];
    expect(put1.body?.stageIndex).toBe(1);
    expect(put1.body?.expectedComponentsRevision).toBe(0);
    expect((put1.body?.components as ComponentDef[]).map((c) => c.name)).toEqual(["NotA"]);
    // The server applied PUT#1 the moment it was issued (library rev → 1),
    // but the client has not seen the ack yet.
    expect((await put1.serverWork).status).toBe(200);

    // Stage 2: create component B while ITS debounce is still pending.
    selectStage(2);
    createComponent("NotB", "Sum");
    expect(exposed.state.componentsEditSeq).toBe(2);

    // Stage-1's ack lands: it carried only seq 1, so B's edit must stay
    // unconfirmed — the library's dirty signal survives another stage's save.
    await deliver(put1);
    expect(exposed.state.componentsChanged).toBe(true);

    // Stage-2's timer fires → its PUT carries the whole library, B included.
    await advance();
    const put2 = puts()[1];
    expect(put2.body?.stageIndex).toBe(2);
    expect(put2.body?.expectedComponentsRevision).toBe(1);
    expect((put2.body?.components as ComponentDef[]).map((c) => c.name)).toEqual(["NotA", "NotB"]);
    await deliver(put2);
    expect(exposed.state.componentsChanged).toBe(false);

    // The real server holds both components — B survives a refresh.
    const project = await projectPayload();
    expect(project.unlockedSubmodules.map((c) => c.name)).toEqual(["NotA", "NotB"]);
    expect(project.drafts["2"].nodes.some((n) => n.kind === "component" && n.name === "NotB")).toBe(
      true,
    );
  });

  it("T2: a component-fenced send parks the stage's save task and re-sends after the library resyncs", async () => {
    await loadProject();

    // Another device has already moved the library to revision 1.
    const foreign = await foreignPut({
      stageIndex: 3,
      graph: { nodes: [], edges: [] },
      components: [{ name: "ForeignPart", graph: { nodes: [], edges: [] }, custom: true }],
      expectedRevision: 0,
      expectedComponentsRevision: 0,
    });
    expect((await foreign.json()).applied).toBe(true);

    // Stage 1: create component A — its save claims the stale revision 0.
    createComponent("NotA", "Y");
    await advance();
    const put1 = puts()[0];
    expect((await put1.serverWork).status).toBe(200);

    // Stage 2: edit the draft while stage-1's save is still in flight, then
    // switch away — its debounce arm fires while the project fence is up.
    selectStage(2);
    dispatch({ type: "add-node", kind: "not", x: 200, y: 80 });
    selectStage(3);

    // Stage-1's refusal lands: components revision reported 1 → fence armed,
    // stage-1's conflict reconcile starts its refetch.
    await deliver(put1);
    const refetch = calls.find((call, index) => index > 0 && call.method === "GET");
    expect(refetch?.url).toBe(`/api/classes/${classId}/labs/calculator/project`);

    // Stage-2's arm fires into the armed fence: it must be PARKED (a pending
    // save task survives), not deleted — no second PUT is issued yet.
    await advance();
    expect(puts()).toHaveLength(1);

    // The reconcile lands: the lesson state adopts (server library, rev 1) —
    // A's unconfirmed local edit moves into the restorable conflict backup.
    await deliver(refetch!);
    expect(exposed.state.componentsRevision).toBe(1);
    expect(exposed.state.conflictedComponents?.map((c) => c.name)).toEqual(["NotA"]);

    // The resync lifts the fence: stage-2's parked arm re-sends and its draft
    // is persisted — the stage never sat without a save task or recovery path.
    const put2 = puts()[1];
    expect(put2).toBeDefined();
    expect(put2.body?.stageIndex).toBe(2);
    // The resynced library no longer rides this save — the draft alone goes.
    expect(put2.body?.components).toBeUndefined();
    expect(put2.body?.expectedComponentsRevision).toBeUndefined();
    await deliver(put2);
    expect(statusForStage(exposed.state.saveStatusByStage, 2)).toBe("saved");

    const project = await projectPayload();
    const stage2 = project.drafts["2"];
    expect(stage2.nodes.some((node) => node.kind === "not")).toBe(true);
    // The stale local library never overwrote the foreign device's write.
    expect(project.unlockedSubmodules.map((c) => c.name)).toEqual(["ForeignPart"]);
  });

  it("T3: a stale autosave response cannot regress the library revision a judge already adopted", async () => {
    await loadProject();

    // Stage 2: create component A — autosave leaves with the library at seq 1.
    selectStage(2);
    createComponent("NotA", "Sum");
    await advance();
    const put1 = puts()[0];
    expect((await put1.serverWork).status).toBe(200);

    // The judge's write lands first server-side (adopts rev → 2), while the
    // earlier autosave response is still on its way back.
    const judgePromise = submitJudge(2, halfAdderGraph());
    const judgeCall = calls.find((call) => call.method === "POST");
    expect(judgeCall).toBeDefined();
    await deliver(judgeCall!);
    await judgePromise;
    expect(exposed.state.componentsRevision).toBe(2);
    expect(componentNames()).toEqual(["NotA", "HalfAdder"]);

    // The stale ack (it reports the revision ITS write produced: 1) must not
    // drag the confirmed counter back to 1.
    await deliver(put1);
    expect(exposed.state.componentsRevision).toBe(2);

    // The next library edit therefore sends a fresh expected revision — the
    // real server accepts it instead of bouncing a spurious conflict.
    createComponent("NotB", "Carry");
    await advance();
    const put2 = puts()[1];
    expect(put2.body?.expectedComponentsRevision).toBe(2);
    await deliver(put2);
    expect(exposed.state.componentsRevision).toBe(3);

    const project = await projectPayload();
    expect(project.unlockedSubmodules.map((c) => c.name)).toEqual(["NotA", "HalfAdder", "NotB"]);
    expect(project.draftRevisions["components"]).toBe(3);
  });
});
