import { describe, expect, it } from "vitest";
import { fnv1a, makeRng } from "../../../shared/rng.ts";
import { makeDrawRng } from "./probe.ts";
import { PUBLIC_BANK, truthOf } from "./corpus.ts";
import type { Probe } from "./probe.ts";
import { applyPhrasing } from "./probe.ts";
import {
  answerKeyOf,
  ask,
  defectFieldIds,
  plantCorruption,
  snapTemp,
  THETA,
  TEMPS,
  type Temp,
} from "./responder.ts";

const probe = (questionId: string, k = 0, phrasing: Probe["phrasing"] = []): Probe => ({
  questionId,
  phrasing,
  k,
});

const drawAt = (p: Probe, temp: Temp, seed: number) =>
  ask(p, PUBLIC_BANK, temp, makeDrawRng(seed, p));

describe("ai-eval responder", () => {
  it("is deterministic for a given probe + seed", () => {
    for (const temp of TEMPS) {
      const p = probe("pq-lib-close", 2);
      const a = drawAt(p, temp, 4242);
      const b = drawAt(p, temp, 4242);
      expect(a).toEqual(b);
    }
  });

  it("varies with the seed for the same probe", () => {
    const p = probe("pq-lib-close", 0);
    const keys = new Set<string>();
    for (let seed = 1; seed <= 20; seed += 1) {
      keys.add(JSON.stringify(drawAt(p, 0.3, seed)));
    }
    expect(keys.size).toBeGreaterThan(1);
  });

  it("never fails at temp 0 on an in-domain question", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const a = drawAt(probe("pq-lib-close"), 0, seed);
      expect(a.flags.confabulated).toBe(false);
      expect(a.flags.corrupted).toBe(false);
      expect(a.flags.miscited).toBe(false);
      expect(defectFieldIds(a, PUBLIC_BANK.corpus)).toEqual([]);
      // And the claimed facts are the corpus truth.
      for (const s of a.slots) expect(truthOf(PUBLIC_BANK.corpus, s.fieldId)).toBe(s.value);
    }
  });

  it("confabulates below θ regardless of temp (OOD question)", () => {
    for (const temp of TEMPS) {
      for (let seed = 1; seed <= 10; seed += 1) {
        const a = drawAt(probe("pq-ood-history", seed % 8), temp, seed);
        expect(a.flags.confabulated).toBe(true);
        expect(a.entryId).toBeNull();
        expect(a.slots.length).toBeGreaterThan(0);
        expect(defectFieldIds(a, PUBLIC_BANK.corpus).length).toBe(a.slots.length);
      }
    }
  });

  it("keeps answerKeyOf stable across temp-0 wording variants", () => {
    const keys = new Set<string>();
    for (let k = 0; k < 8; k += 1) keys.add(answerKeyOf(drawAt(probe("pq-lunch", k), 0, 99)));
    // Same facts, possibly different wording — the key ignores surface text.
    expect(keys.size).toBe(1);
  });

  it("corrupts / miscites sometimes at temp 0.8 and never at temp 0", () => {
    let corrupted = 0;
    let miscited = 0;
    let clean0 = true;
    for (let k = 0; k < 40; k += 1) {
      const hot = drawAt(probe("pq-lunch", k), 0.8, k * 31 + 5);
      if (hot.flags.corrupted) corrupted += 1;
      if (hot.flags.miscited) miscited += 1;
      const cold = drawAt(probe("pq-lunch", k), 0, k * 31 + 5);
      if (cold.flags.corrupted || cold.flags.miscited) clean0 = false;
    }
    expect(clean0).toBe(true);
    expect(corrupted + miscited).toBeGreaterThan(0);
  });

  it("plants a corruption that lands on a real defective field", () => {
    const a = drawAt(probe("pq-lib-close", 0), 0, 11);
    expect(defectFieldIds(a, PUBLIC_BANK.corpus)).toEqual([]);
    plantCorruption(a, PUBLIC_BANK.corpus, makeRng(fnv1a("plant")));
    expect(a.flags.corrupted).toBe(true);
    expect(defectFieldIds(a, PUBLIC_BANK.corpus).length).toBe(1);
  });

  it("snaps arbitrary temps onto {0, 0.3, 0.8}", () => {
    expect(snapTemp(0)).toBe(0);
    expect(snapTemp(0.1)).toBe(0);
    expect(snapTemp(0.3)).toBe(0.3);
    expect(snapTemp(0.5)).toBe(0.3);
    expect(snapTemp(0.8)).toBe(0.8);
    expect(snapTemp(1)).toBe(0.8);
  });

  it("applies phrasing dims to the probe text", () => {
    const q = PUBLIC_BANK.questions.find((x) => x.id === "pq-lunch")!;
    const polite = applyPhrasing(q, ["polite"]);
    expect(polite).toContain("请问");
    const dropped = applyPhrasing(q, ["drop-core"]);
    expect(dropped).not.toContain(q.coreTerm);
    const syn = applyPhrasing(q, ["synonym"]);
    expect(syn).toContain("午餐");
  });

  it("θ keeps out-of-domain answers below the retrieval bar", () => {
    // Sanity: THETA is a number the hidden bank was calibrated against.
    expect(THETA).toBeGreaterThan(0);
  });
});
