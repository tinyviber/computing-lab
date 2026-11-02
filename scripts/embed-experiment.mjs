// Offline scoring harness for the AI-intake PoC.
// Reads poc-vectors.json (exported from the browser via window.__aiEmbed) and
// scores the 12 intake orders under different schemes — pure math, no model.
// Usage: node scripts/embed-experiment.mjs [A|B|C|D|all]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vecPath = process.env.POC_VECTORS ?? `${process.env.HOME}/Downloads/kitchen/poc-vectors.json`;
const data = JSON.parse(readFileSync(vecPath, "utf8"));
const { orders: ORDERS, protos: PROTOS, texts } = data;
const vecs = data.vecs?.vectors ?? data.vecs;
const vec = new Map(texts.map((t, i) => [t, vecs[i]]));

const cos = (a, b) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d; // vectors are already L2-normalized by the model
};

const splitClauses = (text) =>
  text
    .split(/[，。；：、！？,.;:?!]+/)
    .map((s) => s.trim())
    .filter(Boolean);

const literalTable = (text) => {
  const m = /([1-8])\s*号桌/.exec(text) ?? /(?:桌号|桌)\s*([1-8])/.exec(text);
  return m ? m[1] : null;
};
const literalItem = (text) => {
  for (const d of ["鸡腿饭", "牛肉面", "蛋炒饭"]) if (text.includes(d)) return d;
  if (text.includes("炒饭")) return "蛋炒饭";
  return null;
};
const literalNote = (text) => {
  for (const n of ["不要香菜", "不放香菜", "少辣", "加蛋", "无备注"])
    if (text.includes(n)) return n;
  return null;
};

function scoreField(clauses, candidates, agg = "max") {
  const scored = candidates.map((cand) => {
    const sims = [];
    for (const proto of cand.protos) {
      const pv = vec.get(proto);
      let best = -1;
      for (const clause of clauses) best = Math.max(best, cos(vec.get(clause), pv));
      sims.push(best);
    }
    const best = agg === "mean" ? sims.reduce((a, b) => a + b, 0) / sims.length : Math.max(...sims);
    return { value: cand.value, score: best };
  });
  scored.sort((a, b) => b.score - a.score);
  return {
    value: scored[0].value,
    sim: scored[0].score,
    margin: scored.length > 1 ? scored[0].score - scored[1].score : 1,
    top2: scored.slice(0, 2).map((s) => `${s.value}:${s.score.toFixed(3)}`),
  };
}

function predict(order, cfg) {
  const clauses = splitClauses(order.request);
  const pick = (flag, cands, agg) => scoreField(flag ? clauses : [order.request], cands, agg);
  const item = pick(cfg.item.clause, PROTOS.item, cfg.item.agg);
  const note = pick(cfg.note.clause, PROTOS.note, cfg.note.agg);
  const urgent = pick(cfg.urgent.clause, PROTOS.urgent, cfg.urgent.agg);
  return {
    item: cfg.item.literal ? (literalItem(order.request) ?? item.value) : item.value,
    note: cfg.note.literal ? (literalNote(order.request) ?? note.value) : note.value,
    table: cfg.table === "literal" ? (literalTable(order.request) ?? "?") : "?",
    urgent: urgent.value,
    meta: { item, note, urgent },
  };
}

const SCHEMES = {
  A: {
    name: "A: whole-sentence (current baseline)",
    item: { clause: false },
    note: { clause: false },
    urgent: { clause: false },
    table: "embed",
  },
  B: {
    name: "B: clause-level note+urgent",
    item: { clause: false },
    note: { clause: true },
    urgent: { clause: true },
    table: "literal",
  },
  C: {
    name: "C: clause note+urgent + literal item/table",
    item: { clause: false, literal: true },
    note: { clause: true },
    urgent: { clause: true },
    table: "literal",
  },
  D: {
    name: "D: all-literal first (item/note/table) + clause urgent",
    item: { clause: false, literal: true },
    note: { clause: true, literal: true },
    urgent: { clause: true },
    table: "literal",
  },
  E: {
    name: "E: D + mean-agg urgent",
    item: { clause: false, literal: true },
    note: { clause: true, literal: true },
    urgent: { clause: true, agg: "mean" },
    table: "literal",
  },
};

const which = process.argv[2]?.toUpperCase();
for (const [key, cfg] of Object.entries(SCHEMES)) {
  if (which && which !== "ALL" && which !== key) continue;
  let correct = 0;
  const rows = [];
  for (const order of ORDERS) {
    const p = predict(order, cfg);
    const ok =
      p.item === order.expected.item &&
      p.note === order.expected.note &&
      p.table === order.expected.table &&
      p.urgent === order.expected.urgent;
    if (ok) correct++;
    const f = (exp, got) => (exp === got ? `${got}` : `${got}✗(want ${exp})`);
    rows.push(
      `${order.id} ${ok ? "✓" : "✗"} item=${f(order.expected.item, p.item)} ` +
        `note=${f(order.expected.note, p.note)} [${p.meta.note.top2.join(" ")} m=${p.meta.note.margin.toFixed(3)}] ` +
        `table=${f(order.expected.table, p.table)} ` +
        `urgent=${f(order.expected.urgent, p.urgent)} [${p.meta.urgent.top2.join(" ")} m=${p.meta.urgent.margin.toFixed(3)}]`,
    );
  }
  console.log(`\n=== ${cfg.name} → ${correct}/12 ===`);
  for (const r of rows) console.log(`  ${r}`);
}
