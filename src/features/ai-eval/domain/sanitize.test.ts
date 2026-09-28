import { describe, expect, it } from "vitest";
import { emptyAiEvalDraft } from "./protocol.ts";
import { sanitizeAiEvalDraft } from "./sanitize.ts";

describe("ai-eval draft sanitize", () => {
  it("strips non-whitelisted fields like passed/score/fact/entryId", () => {
    const draft = sanitizeAiEvalDraft(
      1,
      {
        transcript: [],
        ratings: { q1: "stable" },
        passed: true,
        score: 4,
        fact: "图书馆 20:30 闭馆",
        entryId: "lib-close",
        flags: { confabulated: false },
        answer: "文本答案",
        hack: 1,
      },
      undefined,
    );
    expect(draft).toEqual({ ...emptyAiEvalDraft(), ratings: { q1: "stable" } });
    expect("passed" in draft).toBe(false);
    expect("score" in draft).toBe(false);
    expect("fact" in draft).toBe(false);
  });

  it("rejects malformed transcript rows and answer text", () => {
    const draft = sanitizeAiEvalDraft(
      1,
      {
        transcript: [
          { probe: { questionId: "q", phrasing: [], k: 0 }, drawId: "abc123", collectedAt: 1 },
          // forged: drawId pattern fails, missing collectedAt, text smuggled
          { probe: { questionId: "q", phrasing: [], k: 1 }, drawId: "not-hex!", collectedAt: 2 },
          { probe: { questionId: "q", phrasing: [], k: 1 }, drawId: "ff00ff" },
          {
            probe: { questionId: "q", phrasing: ["bogus-dim"], k: 0 },
            drawId: "beef00",
            collectedAt: 3,
          },
        ],
      },
      undefined,
    );
    // Row 1 (bad drawId) and row 3 (no collectedAt) drop; the bogus-dim row
    // survives with the unknown dim stripped.
    expect(draft.transcript).toHaveLength(2);
    expect(draft.transcript[1].probe.phrasing).toEqual([]);
    const draft2 = sanitizeAiEvalDraft(
      2,
      {
        transcript: [
          {
            probe: { questionId: "c2-med", phrasing: ["synonym", "bogus"], k: 0 },
            drawId: "beef00",
            collectedAt: 1,
          },
        ],
      },
      undefined,
    );
    expect(draft2.transcript[0].probe.phrasing).toEqual(["synonym"]);
  });

  it("gates fields by stage (C1 draft cannot smuggle C3 verdicts)", () => {
    const draft = sanitizeAiEvalDraft(
      1,
      { verdicts: { abc123: { v: "doubt", fieldId: "x.y" } }, matrix: { base: ["aabb00"] } },
      undefined,
    );
    expect(draft.verdicts).toEqual({});
    expect(draft.matrix).toEqual({});
  });

  it("never takes server-managed fields from client input", () => {
    const draft = sanitizeAiEvalDraft(
      3,
      {
        verifyLog: ["forged.field"],
        predictedAt: 99,
        _srv: {
          seq: 9,
          issued: [{ probe: { questionId: "*", phrasing: [], k: 0 }, drawId: "abc123", seq: 1 }],
          firstDrawSeq: 1,
        },
      },
      undefined,
    );
    expect(draft.verifyLog).toEqual([]);
    expect(draft.predictedAt).toBeNull();
    expect(draft._srv).toBeUndefined();
  });

  it("carries server marks from the prior stored draft", () => {
    const prior = {
      ...emptyAiEvalDraft(),
      verifyLog: ["h-lib-close.time"],
      predictedAt: 2,
      _srv: {
        seq: 3,
        issued: [{ probe: { questionId: "*", phrasing: [], k: 0 }, drawId: "abc123", seq: 1 }],
        firstDrawSeq: 1,
      },
    };
    const draft = sanitizeAiEvalDraft(3, { verifyLog: [], predictedAt: null }, prior);
    expect(draft.verifyLog).toEqual(["h-lib-close.time"]);
    expect(draft.predictedAt).toBe(2);
    expect(draft._srv?.issued).toHaveLength(1);
  });

  it("truncates transcript past the bound and keeps verdicts bounded", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
      probe: { questionId: "q", phrasing: [], k: i % 8 },
      drawId: (i + 1).toString(16).padStart(6, "0"),
      collectedAt: i + 1,
    }));
    const draft = sanitizeAiEvalDraft(1, { transcript: rows }, undefined);
    expect(draft.transcript).toHaveLength(32);
  });
});
