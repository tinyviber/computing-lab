import { describe, expect, it } from "vitest";
import type { PixelMatrix } from "../../../src/features/decoding/domain/bmp.ts";
import type { DecodingDraft } from "../../../src/features/decoding/domain/protocol.ts";
import { generatePayload } from "../../../src/features/decoding/domain/payload.ts";
import { seedFor } from "../../../src/features/decoding/domain/rng.ts";
import { getDecodingStage } from "../../../src/features/decoding/domain/stages.ts";
import { newId, openMemoryDb } from "../../db/client.ts";
import { getOrCreateProject, type ProjectRow } from "../pipeline.ts";
import { judgeDecodingSubmission } from "./judge.ts";

function setup(passedStages: number[] = []) {
  const db = openMemoryDb();
  const userId = newId();
  const classId = newId();
  db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
    classId,
    "实验班",
    "invite-1",
  );
  db.prepare(
    "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
  ).run(userId, "stu-1", "学生", "hash", "user");
  db.prepare("INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, ?)").run(
    newId(),
    classId,
    userId,
    "student",
  );
  const project = getOrCreateProject<DecodingDraft>(db, userId, classId, "decoding");
  if (passedStages.length > 0) {
    db.prepare("UPDATE student_projects SET passed_stages = ? WHERE id = ?").run(
      JSON.stringify(passedStages),
      project.id,
    );
    project.passedStages = passedStages;
  }
  return { db, project: project as ProjectRow<DecodingDraft>, userId };
}

/** The concept answers the client would have collected (all correct). */
function conceptAnswersFor(stageIndex: number): Record<string, number> {
  const stage = getDecodingStage(stageIndex)!;
  return Object.fromEntries(
    (stage.prompts ?? []).map((prompt) => [
      prompt.id,
      prompt.options.findIndex((o) => o.correct === true),
    ]),
  );
}

/** Rebuild the reference artifact exactly as a correct student decoder would. */
function correctArtifact(userId: string, stageIndex: number): unknown {
  const stage = getDecodingStage(stageIndex)!;
  const { payload, expected } = generatePayload(stage, seedFor(userId, "decoding", stageIndex));
  switch (stage.kind) {
    case "bmp":
      return expected; // { pixels }
    case "files":
      return expected; // { verdicts }
    default:
      return expected; // { text }
  }
}

describe("decoding judge", () => {
  it("passes stage 1 with the decoded word and advances", () => {
    const { db, project, userId } = setup();
    const result = judgeDecodingSubmission(db, project, 1, {
      artifact: correctArtifact(userId, 1),
      conceptAnswers: conceptAnswersFor(1),
      code: "def decode(data): return ''.join(map(chr, data))",
    });
    expect("passed" in result && result.passed).toBe(true);
    if ("passed" in result) {
      expect(result.parts.every((p) => p.ok)).toBe(true);
      expect(result.passedStages).toEqual([1]);
      expect(result.currentStage).toBe(2);
    }
    const row = db
      .prepare("SELECT passed_stages FROM student_projects WHERE id = ?")
      .get(project.id) as { passed_stages: string };
    expect(JSON.parse(row.passed_stages)).toEqual([1]);
  });

  it("rejects a wrong decode with a positional detail, not the answer", () => {
    const { db, project, userId } = setup();
    const want = correctArtifact(userId, 1) as { text: string };
    const wrong = { text: `${want.text.slice(0, -1)}Z` };
    const result = judgeDecodingSubmission(db, project, 1, {
      artifact: wrong.text === want.text ? { text: "XXXXX" } : wrong,
      conceptAnswers: conceptAnswersFor(1),
    });
    expect("passed" in result && result.passed).toBe(false);
    if ("passed" in result) {
      const textPart = result.parts.find((p) => p.id === "text");
      expect(textPart?.ok).toBe(false);
      expect(textPart?.detail).toMatch(/第 \d+ 个字符不符|长度不符/);
      expect(textPart?.detail ?? "").not.toContain(want.text);
    }
  });

  it("records wrong concept picks as parts — no bare 'done' flag, no opaque 400", () => {
    const { db, project, userId } = setup();
    const result = judgeDecodingSubmission(db, project, 1, {
      artifact: correctArtifact(userId, 1),
      conceptAnswers: {},
    });
    expect("parts" in result && result.parts).toBeDefined();
    if (!("parts" in result)) return;
    expect(result.passed).toBe(false);
    const promptPart = result.parts.find((p) => p.id.startsWith("prompt-"));
    expect(promptPart?.ok).toBe(false);
    // The artifact still got verified, so debugging info is not withheld.
    expect(result.parts.find((p) => p.id === "text")?.ok).toBe(true);
    // The pick set is in the snapshot for teacher review.
    const row = db
      .prepare("SELECT snapshot_graph FROM submissions WHERE project_id = ?")
      .get(project.id) as { snapshot_graph: string };
    expect(JSON.parse(row.snapshot_graph).conceptAnswers).toEqual({});
  });

  it("rejects malformed artifacts", () => {
    const { db, project } = setup();
    const result = judgeDecodingSubmission(db, project, 1, {
      artifact: { text: 42 },
      conceptAnswers: conceptAnswersFor(1),
    });
    expect(result).toEqual({ error: "malformed-artifact", status: 400 });
  });

  it("gates locked stages", () => {
    const { db, project, userId } = setup();
    const result = judgeDecodingSubmission(db, project, 2, {
      artifact: correctArtifact(userId, 2),
      conceptAnswers: conceptAnswersFor(2),
    });
    expect(result).toEqual({ error: "stage-locked", status: 409 });
  });

  it("stage 3 judges the pixel matrix alone", () => {
    const { db, project, userId } = setup([1, 2]);
    const good = correctArtifact(userId, 3) as { pixels: PixelMatrix };
    const result = judgeDecodingSubmission(db, project, 3, {
      artifact: good,
      conceptAnswers: conceptAnswersFor(3),
    });
    expect("passed" in result && result.passed).toBe(true);

    const { db: db2, project: project2, userId: userId2 } = setup([1, 2]);
    const good2 = correctArtifact(userId2, 3) as { pixels: PixelMatrix };
    const wrongPixels = good2.pixels.map((row, y) =>
      row.map((px, x) => (y === 0 && x === 0 ? ([0, 0, 0] as const) : px)),
    );
    const bad = judgeDecodingSubmission(db2, project2, 3, {
      artifact: { pixels: wrongPixels },
      conceptAnswers: conceptAnswersFor(3),
    });
    expect("passed" in bad && bad.passed).toBe(false);
    if ("passed" in bad) {
      expect(bad.parts.find((p) => p.id === "pixels")?.ok).toBe(false);
    }
  });

  it("stage 4 accepts right verdicts and rejects a swapped decoder", () => {
    const { db, project, userId } = setup([1, 2, 3]);
    const artifact = correctArtifact(userId, 4) as {
      verdicts: { decoder: "text" | "image"; text?: string; pixels?: PixelMatrix }[];
    };
    const result = judgeDecodingSubmission(db, project, 4, {
      artifact,
      conceptAnswers: conceptAnswersFor(4),
    });
    expect("passed" in result && result.passed).toBe(true);

    const swapped = {
      verdicts: artifact.verdicts.map((v) =>
        v.decoder === "text" ? { decoder: "image" as const, text: v.text } : v,
      ),
    };
    const bad = judgeDecodingSubmission(db, project, 4, {
      artifact: swapped,
      conceptAnswers: conceptAnswersFor(4),
    });
    expect("passed" in bad && bad.passed).toBe(false);
  });

  it("stage 5 (side) unlocks after stage 3 and checks the hidden message", () => {
    const { db, project, userId } = setup([1, 2, 3]);
    const result = judgeDecodingSubmission(db, project, 5, {
      artifact: correctArtifact(userId, 5),
      conceptAnswers: conceptAnswersFor(5),
    });
    expect("passed" in result && result.passed).toBe(true);
  });
});
