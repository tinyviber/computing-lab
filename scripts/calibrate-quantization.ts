/**
 * Calibration harness for the color-quantization lab.
 *
 * Run: bun scripts/calibrate-quantization.ts
 *
 * For every stage this prints the achievable accuracy over the merged
 * public+hidden gallery — the same gallery the server judge uses (the
 * hidden-seed logic below mirrors server/judge/color-quantization/
 * hiddenSet.ts; keep them in sync). Pick stages enumerate every toner
 * subset; the free stage climbs the override ladder. Use the output to set
 * requiredAccuracy / tonerSlots / overrideBudget in domain/stages.ts.
 */

import {
  nnTable,
  usedToners,
  countOverrides,
} from "../src/features/color-quantization/domain/quantize.ts";
import { judgeMapping } from "../src/features/color-quantization/domain/recognize.ts";
import {
  COLOR_QUANT_STAGES,
  getQuantStage,
} from "../src/features/color-quantization/domain/stages.ts";
import { TONER_RACK, SOURCE_COLORS } from "../src/features/color-quantization/domain/palette.ts";
import { judgeGalleryFor } from "../server/judge/color-quantization/hiddenSet.ts";

function* subsets(m: number, k: number, start = 0, cur: number[] = []): Generator<number[]> {
  if (cur.length === k) {
    yield cur;
    return;
  }
  for (let i = start; i <= m - (k - cur.length); i += 1) {
    yield* subsets(m, k, i + 1, [...cur, i]);
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

for (const stage of COLOR_QUANT_STAGES) {
  const gallery = judgeGalleryFor(stage.category);
  console.log(
    `\n=== stage ${stage.index} ${stage.id} (${stage.category}, mode=${stage.mode}, ` +
      `slots=${stage.tonerSlots ?? "-"}, overrideBudget=${stage.overrideBudget ?? "-"}, ` +
      `τ=${stage.requiredAccuracy}) — gallery ${gallery.length} ===`,
  );

  if (stage.mode === "pick") {
    const k = stage.tonerSlots!;
    const rows = [...subsets(TONER_RACK.length, k)].map((s) => ({
      s,
      acc: judgeMapping(gallery, nnTable(s)).accuracy,
    }));
    rows.sort((a, b) => b.acc - a.acc);
    const perfect = rows.filter((r) => r.acc === 1);
    const passing = rows.filter((r) => r.acc >= stage.requiredAccuracy);
    console.log(
      `  ${rows.length} subsets of ${k}: best=${pct(rows[0].acc)} [${rows[0].s}], ` +
        `perfect=${perfect.length}, passing τ=${stage.requiredAccuracy}: ${passing.length}`,
    );
    console.log(
      `  top: ${rows
        .slice(0, 6)
        .map((r) => `[${r.s}]=${pct(r.acc)}`)
        .join("  ")}`,
    );
    // naive pick students will try: the "primary colors" {K,R,Y,B}
    const naive = rows.find((r) => r.s.join() === "0,1,3,6");
    if (naive) console.log(`  naive {K,R,Y,B}: ${pct(naive.acc)}`);
    const allIn = judgeMapping(gallery, nnTable(TONER_RACK.map((_t, i) => i))).accuracy;
    console.log(`  all-8 loaded: ${pct(allIn)}`);
  } else {
    const loadout = stage.fixedLoadout!;
    const nn = nnTable(loadout);
    const baseAcc = judgeMapping(gallery, nn).accuracy;
    console.log(`  fixed loadout [${loadout}] NN baseline: ${pct(baseAcc)}`);
    // greedy override ladder
    const cur = nn.slice();
    const allowed = [...loadout, -1];
    for (let e = 1; e <= 8; e += 1) {
      let bestAcc = judgeMapping(gallery, cur).accuracy;
      let bi = -1;
      let bv = 0;
      for (let i = 0; i < cur.length; i += 1) {
        for (const v of allowed) {
          if (v === cur[i]) continue;
          const t = cur.slice();
          t[i] = v;
          const acc = judgeMapping(gallery, t).accuracy;
          if (acc > bestAcc) {
            bestAcc = acc;
            bi = i;
            bv = v;
          }
        }
      }
      if (bi < 0) {
        console.log(`  override ladder stalls at ${pct(bestAcc)}`);
        break;
      }
      cur[bi] = bv;
      const target = bv < 0 ? "paper" : TONER_RACK[bv].name;
      console.log(
        `  ${e} override(s): ${pct(bestAcc)}  (${SOURCE_COLORS[bi].name} -> ${target}, ` +
          `overrides=${countOverrides(cur, nn)}, used=[${usedToners(cur)}])`,
      );
      if (bestAcc === 1) break;
    }
  }
}

// usage note for stage defs
const s3 = getQuantStage(3);
if (s3) console.log(`\nstage 3 ceiling check: τ=${s3.requiredAccuracy} must be <= printed best.`);
