import { useEffect, useMemo, useState } from "react";
import { api, describeApiError } from "../../shared/api/client";
import { evaluateGraph } from "../../features/calculator/domain/evaluate";
import type { CircuitGraph, ComponentDef } from "../../features/calculator/domain/graph";
import { getStage } from "../../features/calculator/domain/stages";
import type { ComponentCatalog } from "../../features/calculator/lesson/state";
import { CircuitCanvas } from "../../features/calculator/ui/CircuitCanvas";
import { Icon } from "../../shared/ui/Icon";

/** Server canvas envelope: kind is the renderer discriminator, never assume a graph. */
type CanvasPayload = { kind: "circuit" | "raw"; graph?: unknown; data?: unknown };

type SubmissionMeta = {
  id: string;
  stageIndex: number;
  score: number;
  total: number;
  passed: boolean;
  submittedAt: string;
};

type DraftResponse = {
  updatedAt: string | null;
  drafts: Record<string, CanvasPayload>;
  components: ComponentDef[];
};

type SubmissionIndexResponse = { submissions: SubmissionMeta[] };

type SubmissionResponse = {
  submission: SubmissionMeta & { testSummary?: { error: string | null } };
  canvas: CanvasPayload;
  components: ComponentDef[];
};

type CanvasTarget = { canvas: CanvasPayload; components: ComponentDef[] };

function catalogOf(components: ComponentDef[] | undefined): ComponentCatalog {
  return Object.fromEntries((components ?? []).map((def) => [def.name, def]));
}

function CircuitView({ graph, catalog }: { graph: CircuitGraph; catalog: ComponentCatalog }) {
  const preview = useMemo(() => {
    const nested = Object.fromEntries(
      Object.entries(catalog).map(([name, def]) => [name, "graph" in def ? def.graph : def]),
    );
    return evaluateGraph(graph, {}, nested);
  }, [graph, catalog]);
  return (
    <div className="canvas-drawer-scroll" role="img" aria-label="电路画布快照">
      <CircuitCanvas
        components={catalog}
        dispatch={() => undefined}
        graph={graph}
        pendingWire={null}
        portValues={preview.portValues}
        readOnly
        selectedNodeId={null}
      />
    </div>
  );
}

function RawView({ data }: { data: unknown }) {
  return <pre className="canvas-drawer-raw">{JSON.stringify(data, null, 2)}</pre>;
}

function CanvasBody({ target }: { target: CanvasTarget }) {
  if (target.canvas.kind === "circuit") {
    return (
      <CircuitView
        catalog={catalogOf(target.components)}
        graph={target.canvas.graph as CircuitGraph}
      />
    );
  }
  return <RawView data={target.canvas.kind === "raw" ? target.canvas.data : target.canvas.graph} />;
}

export function StudentCanvasDrawer({
  labId,
  row,
  onClose,
}: {
  labId: string;
  row: { userId: string; studentNo: string; name: string };
  onClose: () => void;
}) {
  const [revision, setRevision] = useState<"draft" | "submission">("draft");
  const [drafts, setDrafts] = useState<DraftResponse | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionMeta[] | null>(null);
  const [detail, setDetail] = useState<SubmissionResponse | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (revision === "draft") {
      void api
        .get<DraftResponse>(`/api/admin/users/${row.userId}/labs/${labId}/canvas?revision=draft`)
        .then((payload) => {
          setDrafts(payload);
          const stages = Object.keys(payload.drafts).sort((a, b) => Number(a) - Number(b));
          setStage((current) =>
            current && payload.drafts[current] ? current : (stages[0] ?? null),
          );
        })
        .catch((caught) => setError(describeApiError(caught)));
      return;
    }
    void api
      .get<SubmissionIndexResponse>(
        `/api/admin/users/${row.userId}/labs/${labId}/canvas?revision=submission`,
      )
      .then((payload) => {
        setSubmissions(payload.submissions);
        setSubmissionId((current) =>
          current && payload.submissions.some((s) => s.id === current)
            ? current
            : (payload.submissions[0]?.id ?? null),
        );
      })
      .catch((caught) => setError(describeApiError(caught)));
  }, [revision, row.userId, labId]);

  useEffect(() => {
    if (revision !== "submission" || !submissionId) {
      setDetail(null);
      return;
    }
    void api
      .get<SubmissionResponse>(
        `/api/admin/users/${row.userId}/labs/${labId}/canvas?revision=submission&submission=${submissionId}`,
      )
      .then(setDetail)
      .catch((caught) => setError(describeApiError(caught)));
  }, [revision, submissionId, row.userId, labId]);

  const stageList = Object.keys(drafts?.drafts ?? {}).sort((a, b) => Number(a) - Number(b));
  const draftTarget: CanvasTarget | null =
    stage && drafts?.drafts[stage]
      ? { canvas: drafts.drafts[stage], components: drafts.components }
      : null;
  const submissionTarget: CanvasTarget | null = detail
    ? { canvas: detail.canvas, components: detail.components }
    : null;

  const stageTitle = (index: number) => getStage(index)?.title ?? `第 ${index} 关`;

  return (
    <div className="drawer-scrim" role="presentation" onClick={onClose}>
      <aside
        aria-label="学生画布"
        className="drawer drawer-canvas"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <p className="eyebrow">
            {row.studentNo} {row.name}
          </p>
          <h2>画布细节</h2>
          <button aria-label="关闭画布" className="drawer-close" onClick={onClose} type="button">
            <Icon name="x" size={16} />
          </button>
        </header>

        <div className="canvas-drawer-controls">
          <label className="field-select" htmlFor="canvas-revision-select">
            <span>版本</span>
            <select
              id="canvas-revision-select"
              onChange={(event) => setRevision(event.target.value as "draft" | "submission")}
              value={revision}
            >
              <option value="draft">当前草稿</option>
              <option value="submission">提交快照</option>
            </select>
          </label>
          {revision === "draft" && stageList.length > 0 ? (
            <label className="field-select" htmlFor="canvas-stage-select">
              <span>关卡</span>
              <select
                id="canvas-stage-select"
                onChange={(event) => setStage(event.target.value)}
                value={stage ?? ""}
              >
                {stageList.map((index) => (
                  <option key={index} value={index}>
                    {stageTitle(Number(index))}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {revision === "submission" && (submissions?.length ?? 0) > 0 ? (
            <label className="field-select" htmlFor="canvas-submission-select">
              <span>提交</span>
              <select
                id="canvas-submission-select"
                onChange={(event) => setSubmissionId(event.target.value)}
                value={submissionId ?? ""}
              >
                {(submissions ?? []).map((submission) => (
                  <option key={submission.id} value={submission.id}>
                    {stageTitle(submission.stageIndex)} · {submission.score}/{submission.total} ·{" "}
                    {submission.submittedAt.slice(0, 16).replace("T", " ")}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {error ? (
          <p className="test-error" role="alert">
            {error}
          </p>
        ) : null}

        {revision === "draft" ? (
          draftTarget ? (
            <CanvasBody target={draftTarget} />
          ) : (
            <p className="drawer-note">{drafts ? "该学生在这个实验里还没有草稿。" : "正在载入…"}</p>
          )
        ) : submissions && submissions.length === 0 ? (
          <p className="drawer-note">该学生还没有提交记录。</p>
        ) : submissionTarget ? (
          <>
            {detail?.submission.testSummary?.error ? (
              <p className="test-error">{detail.submission.testSummary.error}</p>
            ) : null}
            <CanvasBody target={submissionTarget} />
          </>
        ) : (
          <p className="drawer-note">{submissions ? "正在载入…" : "正在载入…"}</p>
        )}

        {revision === "draft" && drafts?.updatedAt ? (
          <p className="drawer-note">
            草稿更新于 {drafts.updatedAt.slice(0, 19).replace("T", " ")}
          </p>
        ) : null}
        {revision === "submission" && detail ? (
          <p className="drawer-note">
            提交于 {detail.submission.submittedAt.slice(0, 19).replace("T", " ")} ·{" "}
            {detail.submission.passed ? "通过" : "未通过"} {detail.submission.score}/
            {detail.submission.total}
          </p>
        ) : null}
      </aside>
    </div>
  );
}
