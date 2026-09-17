import type { DatabaseSync } from "node:sqlite";
import { newId } from "../db/client.ts";
import {
  BIT_CANVAS_CELLS,
  BIT_CANVAS_EDIT_ROW,
  encodeRow,
} from "../../src/features/image-encoding/domain/bit-canvas.ts";
import {
  checkChallenge2,
  checkCore1,
  checkCore2,
  checkCore3,
  core3Window,
  type CheckResult,
} from "../../src/features/image-encoding/domain/checks.ts";
import { getImageFixture } from "../../src/features/image-encoding/domain/fixture.ts";
import {
  normalizeImage,
  type RasterImage,
  type RGB,
} from "../../src/features/image-encoding/domain/model.ts";
import { getHallucinationCase } from "../../src/features/image-encoding/domain/restoration.ts";
import {
  normalizeArtifact,
  type Artifact,
} from "../../src/features/image-encoding/domain/stops.ts";
import {
  deriveCurrentStage,
  getStage,
  isArtifactBoundStage,
  isStageUnlocked,
} from "../../src/features/image-encoding/domain/stages.ts";

const LAB_ID = "image-encoding";
const DEFAULT_ARTIFACT: Artifact = { image: "photo", resStop: 50, colorStop: "palette4" };

function sameArtifact(first: Artifact, second: Artifact): boolean {
  return (
    first.image === second.image &&
    first.resStop === second.resStop &&
    first.colorStop === second.colorStop
  );
}

type PersistedImageDraft = {
  artifact: Artifact;
  /** Artifact the artifact-bound passes in `passed_stages` were earned under. */
  passedArtifact: Artifact;
  core1Bits: string;
  conventionRevealed: boolean;
  core3Edited?: RasterImage;
  restoreObservation: string;
  hallucinationCaseId?: string;
  hallucinationClicks: readonly { x: number; y: number }[];
};

export type ImageProject = {
  id: string;
  userId: string;
  classId: string;
  currentStage: number;
  passedStages: number[];
  artifact: Artifact;
  draft: PersistedImageDraft;
};

type RawProject = {
  id: string;
  user_id: string;
  class_id: string;
  current_stage: number;
  passed_stages: string;
  draft_graph: string;
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function channel(value: unknown): number {
  const number = Number(value);
  return Math.min(255, Math.max(0, Math.round(Number.isFinite(number) ? number : 0)));
}

function sanitizePixels(value: unknown, expected: RasterImage): RasterImage | undefined {
  const input = object(value);
  if (!input || input.width !== expected.width || input.height !== expected.height)
    return undefined;
  if (!Array.isArray(input.pixels) || input.pixels.length !== expected.width * expected.height) {
    return undefined;
  }
  const pixels: RGB[] = input.pixels.map((entry) => {
    const color = object(entry);
    return {
      r: channel(color?.r),
      g: channel(color?.g),
      b: channel(color?.b),
    };
  });
  return normalizeImage({ ...expected, pixels });
}

function sanitizeClicks(value: unknown): { x: number; y: number }[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-20).flatMap((entry) => {
    const point = object(entry);
    const x = Number(point?.x);
    const y = Number(point?.y);
    return Number.isFinite(x) && Number.isFinite(y)
      ? [{ x: Math.max(0, x), y: Math.max(0, y) }]
      : [];
  });
}

export function sanitizeImageDraft(raw: unknown, artifactInput?: unknown): PersistedImageDraft {
  const input = object(raw) ?? {};
  const artifact = normalizeArtifact(
    object(artifactInput) ?? object(input.artifact) ?? DEFAULT_ARTIFACT,
  );
  const source = getImageFixture(artifact.image);
  const original = core3Window(source, artifact).original;
  return {
    artifact,
    passedArtifact: normalizeArtifact(object(input.passedArtifact) ?? artifact),
    core1Bits: String(input.core1Bits ?? "")
      .replace(/[^01]/g, "")
      .slice(0, 16),
    conventionRevealed: input.conventionRevealed === true,
    core3Edited: sanitizePixels(input.core3Edited, original),
    restoreObservation: String(input.restoreObservation ?? "").slice(0, 1000),
    hallucinationCaseId:
      typeof input.hallucinationCaseId === "string" &&
      getHallucinationCase(input.hallucinationCaseId)
        ? input.hallucinationCaseId
        : undefined,
    hallucinationClicks: sanitizeClicks(input.hallucinationClicks),
  };
}

function toProject(row: RawProject): ImageProject {
  const persisted = parseJson(row.draft_graph);
  const draft = sanitizeImageDraft(persisted);
  const parsed = parseJson(row.passed_stages);
  const passed: unknown[] = Array.isArray(parsed) ? parsed : [];
  const storedPasses = [
    ...new Set(
      passed.filter(
        (value): value is number => Number.isInteger(value) && !!getStage(value as number),
      ),
    ),
  ].sort((a, b) => a - b);
  // Passes bound to an artifact stop counting the moment the stored working
  // artifact no longer matches the artifact they were earned under.
  const passedStages = sameArtifact(draft.artifact, draft.passedArtifact)
    ? storedPasses
    : storedPasses.filter((index) => !isArtifactBoundStage(index));
  return {
    id: row.id,
    userId: row.user_id,
    classId: row.class_id,
    // Derived from effective passes so stored/current stage can never
    // contradict revoked artifact-bound progress.
    currentStage: deriveCurrentStage(passedStages),
    passedStages,
    artifact: draft.artifact,
    draft,
  };
}

// Project identity is (user_id, lab_id), matching the shared
// student_projects UNIQUE(user_id, lab_id) constraint and the calculator
// lab: progress follows the student across classes rather than resetting
// per class. Class membership is still enforced per request by
// requireMembership; class_id on the row records where it was created.
export function getOrCreateImageProject(
  db: DatabaseSync,
  userId: string,
  classId: string,
): ImageProject {
  const existing = db
    .prepare("SELECT * FROM student_projects WHERE user_id = ? AND lab_id = ?")
    .get(userId, LAB_ID) as RawProject | undefined;
  if (existing) return toProject(existing);
  const id = newId();
  const draft = sanitizeImageDraft(null, DEFAULT_ARTIFACT);
  db.prepare(
    "INSERT INTO student_projects (id, user_id, class_id, lab_id, draft_graph) VALUES (?, ?, ?, ?, ?)",
  ).run(id, userId, classId, LAB_ID, JSON.stringify(draft));
  return toProject(db.prepare("SELECT * FROM student_projects WHERE id = ?").get(id) as RawProject);
}

export function saveImageDraft(
  db: DatabaseSync,
  project: ImageProject,
  artifactInput: unknown,
  rawDraft: unknown,
): PersistedImageDraft {
  const draft = sanitizeImageDraft(rawDraft, artifactInput);
  // Artifact-bound passes survive only while the saved artifact still equals
  // the artifact they were earned under; revoke them in the same write.
  const keepBoundPasses = sameArtifact(draft.artifact, project.draft.passedArtifact);
  draft.passedArtifact = keepBoundPasses ? project.draft.passedArtifact : draft.artifact;
  const passedStages = keepBoundPasses
    ? project.passedStages
    : project.passedStages.filter((index) => !isArtifactBoundStage(index));
  db.prepare(
    "UPDATE student_projects SET draft_graph = ?, passed_stages = ?, current_stage = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
  ).run(
    JSON.stringify(draft),
    JSON.stringify(passedStages),
    deriveCurrentStage(passedStages),
    project.id,
  );
  return draft;
}

function checkEvidence(
  stageIndex: number,
  artifact: Artifact,
  rawEvidence: unknown,
): CheckResult | { error: string; status: 400 } {
  const evidence = object(rawEvidence) ?? {};
  const source = getImageFixture(artifact.image);
  if (stageIndex === 1) {
    return checkCore1({
      studentBits: String(evidence.studentBits ?? ""),
      expectedBits: encodeRow(BIT_CANVAS_CELLS, BIT_CANVAS_EDIT_ROW),
    });
  }
  if (stageIndex === 2) return checkCore2({ source, artifact });
  if (stageIndex === 3) {
    const original = core3Window(source, artifact).original;
    const edited = sanitizePixels(evidence.edited, original);
    return edited
      ? checkCore3({ source, artifact, original, edited })
      : { error: "invalid-evidence", status: 400 };
  }
  if (stageIndex === 5) {
    const restorationCase = getHallucinationCase(String(evidence.caseId ?? ""));
    return restorationCase
      ? checkChallenge2({ restorationCase, clicks: sanitizeClicks(evidence.clicks) })
      : { error: "unknown-restoration-case", status: 400 };
  }
  return { error: "stage-has-no-judge", status: 400 };
}

export type ImageJudgeOutcome = {
  passed: boolean;
  detail: string;
  submissionId: string;
  currentStage: number;
  passedStages: number[];
};

export function judgeImageSubmission(
  db: DatabaseSync,
  project: ImageProject,
  stageIndex: number,
  artifactInput: unknown,
  rawEvidence: unknown,
): ImageJudgeOutcome | { error: string; status: 400 | 409 } {
  const stage = getStage(stageIndex);
  if (!stage) return { error: "invalid-stage", status: 400 };
  const artifact = normalizeArtifact(object(artifactInput) ?? DEFAULT_ARTIFACT);
  // Unlocking and pass-keeping are evaluated against the artifact the student
  // submitted under — passes earned under a different artifact do not carry.
  const workingPasses = sameArtifact(artifact, project.draft.passedArtifact)
    ? project.passedStages
    : project.passedStages.filter((index) => !isArtifactBoundStage(index));
  if (!isStageUnlocked(workingPasses, stageIndex)) {
    return { error: "stage-locked", status: 409 };
  }
  const checked = checkEvidence(stageIndex, artifact, rawEvidence);
  if ("error" in checked) return checked;

  const submissionId = newId();
  db.prepare(
    `INSERT INTO submissions
       (id, project_id, user_id, lab_id, stage_index, snapshot_graph, score, total, passed, test_summary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    submissionId,
    project.id,
    project.userId,
    LAB_ID,
    stageIndex,
    JSON.stringify({ artifact, evidence: rawEvidence }),
    checked.passed ? 1 : 0,
    1,
    checked.passed ? 1 : 0,
    JSON.stringify({ detail: checked.detail }),
  );

  const passedStages = checked.passed
    ? [...new Set([...workingPasses, stageIndex])].sort((a, b) => a - b)
    : project.passedStages;
  const currentStage = checked.passed ? deriveCurrentStage(passedStages) : project.currentStage;
  if (checked.passed) {
    // Bind the new pass to the artifact it was earned under and make that the
    // stored working artifact in the same write, so a later draft save of a
    // different artifact revokes it.
    const nextDraft = { ...project.draft, artifact, passedArtifact: artifact };
    db.prepare(
      "UPDATE student_projects SET current_stage = ?, passed_stages = ?, draft_graph = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    ).run(currentStage, JSON.stringify(passedStages), JSON.stringify(nextDraft), project.id);
  }

  return {
    passed: checked.passed,
    detail: checked.detail,
    submissionId,
    currentStage,
    passedStages,
  };
}
