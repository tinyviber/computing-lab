import { Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { api, describeApiError } from "../../../shared/api/client";
import { AccountMenu, useAuth } from "../../../shared/auth";
import { evaluateGraph } from "../domain/evaluate";
import {
  GATE_LABEL,
  type Bit,
  type CircuitGraph,
  type ComponentDef,
  type GateKind,
} from "../domain/graph";
import {
  componentMap,
  componentCatalog,
  createCalculatorLessonState,
  graphOf,
  paletteGates,
  stageOf,
  transitionCalculatorLesson,
} from "../lesson/state";
import { BusReadout } from "./BusReadout";
import { CircuitCanvas } from "./CircuitCanvas";
import { HintDisclosure } from "./HintDisclosure";
import { StageRail } from "./StageRail";
import { TestPanel } from "./TestPanel";
import { AnnotatedText, CalculatorTermGuide } from "./CalculatorTerms";
import { CustomComponentDialog, type ComponentizeForm } from "./CustomComponentDialog";
import "./calculator.css";

const AUTOSAVE_DELAY_MS = 1500;

type DraftSavePayload = {
  classId: string;
  stageIndex: number;
  graph: CircuitGraph;
  components: ComponentDef[];
};

type ProjectPayload = {
  currentStage: number;
  passedStages: number[];
  unlockedSubmodules: ComponentDef[];
  draftGraph: Record<string, CircuitGraph>;
};

type JudgePayload = {
  score: number;
  total: number;
  passed: boolean;
  testSummary: {
    categories: Record<string, { passed: number; total: number }>;
    counterexample: {
      name: string;
      category: string;
      inputs: Record<string, Bit>;
      expected: Record<string, Bit>;
      actual: Record<string, Bit | null>;
    } | null;
    error: string | null;
  };
  currentStage: number;
  passedStages: number[];
  unlockedComponent: string | null;
};

const SAVE_LABEL: Record<string, string> = {
  idle: "",
  dirty: "未保存",
  saving: "保存中…",
  saved: "已保存 ✓",
  error: "保存失败",
};

export function CalculatorLabPage() {
  const { classId } = useParams({ strict: false }) as { classId?: string };
  const { status } = useAuth();
  const [state, dispatch] = useReducer(transitionCalculatorLesson, undefined, () =>
    createCalculatorLessonState(1),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingComponentName, setEditingComponentName] = useState<string | null>(null);
  const saveTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const autosaveContextRef = useRef({ classId, stageIndex: state.stageIndex });
  const saveStatusRef = useRef(state.saveStatus);
  autosaveContextRef.current = { classId, stageIndex: state.stageIndex };
  saveStatusRef.current = state.saveStatus;

  const graph = graphOf(state);
  const components = useMemo(() => componentMap(state), [state.unlockedSubmodules]);
  const componentDefinitions = useMemo(() => componentCatalog(state), [state.unlockedSubmodules]);
  const stage = stageOf(state);
  const selectedNode = graph.nodes.find((node) => node.id === state.selectedNodeId);
  const selectedCustomComponent =
    selectedNode?.kind === "component"
      ? state.unlockedSubmodules.find(
          (component) =>
            component.custom &&
            component.name.toLocaleLowerCase() === (selectedNode.name ?? "").toLocaleLowerCase(),
        )
      : undefined;
  const editingComponent = editingComponentName
    ? state.unlockedSubmodules.find(
        (component) =>
          component.custom &&
          component.name.toLocaleLowerCase() === editingComponentName.toLocaleLowerCase(),
      )
    : undefined;

  // Live preview: evaluate with the pins' current toggle values.
  const preview = useMemo(() => evaluateGraph(graph, {}, components), [graph, components]);

  useEffect(() => {
    if (!classId || status !== "authenticated") return;
    void api
      .get<ProjectPayload>(`/api/classes/${classId}/labs/calculator/project`)
      .then((project) =>
        dispatch({
          type: "load-project",
          currentStage: project.currentStage,
          passedStages: project.passedStages,
          unlockedSubmodules: project.unlockedSubmodules,
          drafts: Object.fromEntries(
            Object.entries(project.draftGraph).map(([key, value]) => [Number(key), value]),
          ),
        }),
      )
      .catch((error) => setLoadError(describeApiError(error)));
  }, [classId, status]);

  // Silent debounced autosave. Timers are keyed by stage so switching stages
  // does not cancel a payload captured for the stage the learner edited.
  const stageIndex = state.stageIndex;
  useEffect(() => {
    if (saveStatusRef.current !== "dirty" || !classId) return;
    const payload: DraftSavePayload = {
      classId,
      stageIndex,
      graph,
      components: state.unlockedSubmodules,
    };
    const previousTimer = saveTimers.current.get(stageIndex);
    if (previousTimer) clearTimeout(previousTimer);
    const timer = setTimeout(() => {
      saveTimers.current.delete(stageIndex);
      dispatch({ type: "mark-saving" });
      void api
        .put(`/api/classes/${payload.classId}/labs/calculator/draft`, {
          stageIndex: payload.stageIndex,
          graph: payload.graph,
          components: payload.components,
        })
        .then(() => dispatch({ type: "mark-saved" }))
        .catch(() => dispatch({ type: "mark-save-error" }));
    }, AUTOSAVE_DELAY_MS);
    saveTimers.current.set(stageIndex, timer);
    return () => {
      // A graph edit on the same stage should debounce its previous payload.
      // A stage switch must leave the old stage's timer alive because its
      // payload is already bound to the old stage and graph.
      if (
        autosaveContextRef.current.classId === classId &&
        autosaveContextRef.current.stageIndex === stageIndex &&
        saveTimers.current.get(stageIndex) === timer
      ) {
        clearTimeout(timer);
        saveTimers.current.delete(stageIndex);
      }
    };
  }, [state.unlockedSubmodules, graph, stageIndex, classId]);

  const onSubmit = useCallback(async () => {
    if (!classId) return;
    setSubmitting(true);
    try {
      const result = await api.post<JudgePayload>(`/api/classes/${classId}/labs/calculator/judge`, {
        stageIndex,
        graph,
        components: state.unlockedSubmodules,
      });
      dispatch({
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
        },
      });
    } catch (error) {
      setLoadError(describeApiError(error));
    } finally {
      setSubmitting(false);
    }
  }, [classId, stageIndex, graph, state.unlockedSubmodules]);

  const addGate = (kind: GateKind) =>
    dispatch({ type: "add-node", kind, x: 300, y: 60 + (state.nextId % 6) * 44 });

  if (status === "loading") {
    return (
      <p className="home-loading" role="status">
        正在载入…
      </p>
    );
  }
  if (status === "anonymous") {
    return (
      <div className="not-found" role="status">
        <p className="eyebrow">实验 / 需要登录</p>
        <h1>请先登录</h1>
        <div className="error-actions">
          <Link className="button button-primary" to="/login">
            去登录
          </Link>
        </div>
      </div>
    );
  }
  if (!classId) {
    return (
      <div className="not-found" role="status">
        <p className="eyebrow">实验 / 未加入班级</p>
        <h1>你还没有加入班级</h1>
        <p>请用老师给的邀请码加入班级后再开始实验。</p>
        <div className="error-actions">
          <Link className="button button-primary" to="/">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="calculator-lab">
      <header className="calculator-topbar">
        <div className="calculator-identity">
          <Link className="brand-mark" to="/" aria-label="返回首页">
            <span className="brand-mark-symbol">⌁</span>
          </Link>
          <div>
            <h1>{stage ? `${String(stage.index).padStart(2, "0")} ${stage.title}` : "实现ALU"}</h1>
            <p>{stage ? <AnnotatedText text={stage.englishTitle} /> : null}</p>
          </div>
        </div>
        <div className="calculator-status">
          <span aria-live="polite" className={`save-indicator is-${state.saveStatus}`}>
            {SAVE_LABEL[state.saveStatus]}
          </span>
          <AccountMenu />
        </div>
      </header>

      <div className="calculator-layout">
        <StageRail
          passedStages={state.passedStages}
          onPlaceComponent={(name) =>
            dispatch({ type: "add-node", kind: "component", name, x: 320, y: 80 })
          }
          onEditCustomComponent={setEditingComponentName}
          onDeleteCustomComponent={(name) => dispatch({ type: "delete-custom-component", name })}
          onSelectStage={(index) => dispatch({ type: "select-stage", stageIndex: index })}
          stageIndex={state.stageIndex}
          unlockedSubmodules={state.unlockedSubmodules}
        />

        <main aria-label="计算器实验区" className="calculator-workspace">
          <section className="stage-brief">
            <p>{stage ? <AnnotatedText text={stage.description} /> : null}</p>
            {stage ? <HintDisclosure hint={stage.hint} key={stage.id} /> : null}
            <CalculatorTermGuide />
          </section>

          {loadError ? (
            <p className="test-error" role="alert">
              {loadError}
            </p>
          ) : null}
          {state.message ? (
            <p
              className={`lab-message${state.judgeOutcome?.passed ? " is-pass" : ""}`}
              role="status"
            >
              {state.message}
              <button onClick={() => dispatch({ type: "dismiss-message" })} type="button">
                知道了
              </button>
            </p>
          ) : null}

          <section aria-label="元件" className="palette">
            <p className="eyebrow">元件</p>
            <div className="palette-items">
              {paletteGates(state).map((kind) => (
                <button
                  className="palette-chip"
                  key={kind}
                  onClick={() => addGate(kind)}
                  type="button"
                >
                  <AnnotatedText text={GATE_LABEL[kind]} />
                </button>
              ))}
              <button
                className="palette-chip is-const"
                onClick={() =>
                  dispatch({ type: "add-node", kind: "const", value: 1, x: 120, y: 300 })
                }
                type="button"
              >
                常量 1
              </button>
              <button
                className="palette-chip is-const"
                onClick={() =>
                  dispatch({ type: "add-node", kind: "const", value: 0, x: 120, y: 340 })
                }
                type="button"
              >
                常量 0
              </button>
            </div>
          </section>

          {stage ? <BusReadout pins={preview.pins} stage={stage} /> : null}

          <CircuitCanvas
            components={componentDefinitions}
            dispatch={dispatch}
            graph={graph}
            pendingWire={state.pendingWire}
            portValues={preview.portValues}
            selectedNodeId={state.selectedNodeId}
          />

          <section className="canvas-help">
            <p>
              点输出端口再点输入端口即可连线；点连线可删除；点输入引脚可切换 0/1
              观察电路实时反应；在空白处拖动可框选元件并封装为自定义组件。选中组件后可折叠，隐藏其全部连接线；也可用
              Ctrl/Cmd+Z 撤销、Delete 删除。
            </p>
            {preview.error ? (
              <p className="test-error" role="alert">
                电路无法求值：{preview.error.detail}
              </p>
            ) : null}
          </section>

          <div className="calculator-actions">
            <button
              className="button button-secondary"
              onClick={() => dispatch({ type: "run-public-tests" })}
              type="button"
            >
              运行公开测试
            </button>
            <button
              className="button button-secondary"
              disabled={state.past[state.past.length - 1]?.stageIndex !== state.stageIndex}
              onClick={() => dispatch({ type: "undo" })}
              type="button"
            >
              撤销
            </button>
            <button
              className="button button-primary"
              disabled={submitting}
              onClick={() => void onSubmit()}
              type="button"
            >
              {submitting ? "判定中…" : "提交"}
            </button>
            <button
              className="button button-ghost"
              onClick={() => dispatch({ type: "reset-stage" })}
              type="button"
            >
              清空本关
            </button>
            {state.selectedNodeId ? (
              <button
                className="button button-ghost"
                onClick={() =>
                  dispatch({ type: "delete-node", id: state.selectedNodeId as string })
                }
                type="button"
              >
                删除选中元件
              </button>
            ) : null}
            {selectedNode?.kind === "component" ? (
              <button
                className="button button-ghost"
                onClick={() => dispatch({ type: "toggle-collapse-node", id: selectedNode.id })}
                type="button"
              >
                {selectedNode.collapsed ? "展开组件" : "折叠组件"}
              </button>
            ) : null}
            {selectedCustomComponent && selectedNode ? (
              <button
                className="button button-ghost"
                onClick={() => dispatch({ type: "expand-component", id: selectedNode.id })}
                type="button"
              >
                拆分回去
              </button>
            ) : null}
          </div>

          <TestPanel
            judgeOutcome={state.judgeOutcome}
            runOutcome={state.runOutcome}
            stage={stage}
          />
        </main>
      </div>
      {editingComponent ? (
        <CustomComponentDialog
          component={editingComponent}
          existingNames={state.unlockedSubmodules.map((component) => component.name)}
          onCancel={() => setEditingComponentName(null)}
          onUpdate={(form: ComponentizeForm) => {
            dispatch({
              type: "edit-custom-component",
              name: editingComponent.name,
              newName: form.name,
              inputNames: form.inputNames,
              outputNames: form.outputNames,
              inputPortKeys: form.inputPortKeys,
              outputPortKeys: form.outputPortKeys,
            });
            setEditingComponentName(null);
          }}
        />
      ) : null}
    </div>
  );
}
