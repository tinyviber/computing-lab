import { describe, expect, it } from "vitest";
import { assembleCloze, clozeComplete, hasCloze, parseCloze } from "./cloze.ts";
import { DECODING_STAGES, starterCodeFor } from "./stages.ts";

describe("cloze parsing", () => {
  const code = "a = __(1)__\nb = __(2)__ + __(1)__\n";

  it("splits a template into text and blank parts", () => {
    expect(parseCloze(code)).toEqual([
      { kind: "text", text: "a = " },
      { kind: "blank", id: "1" },
      { kind: "text", text: "\nb = " },
      { kind: "blank", id: "2" },
      { kind: "text", text: " + " },
      { kind: "blank", id: "1" },
      { kind: "text", text: "\n" },
    ]);
    expect(hasCloze(code)).toBe(true);
    expect(hasCloze("a = 1")).toBe(false);
  });

  it("assembles fills back into runnable code", () => {
    expect(assembleCloze(code, { "1": "54", "2": "i + 1" })).toBe("a = 54\nb = i + 1 + 54\n");
    expect(assembleCloze(code, {})).toBe("a = ?\nb = ? + ?\n");
  });

  it("reports completeness only when every blank is filled", () => {
    expect(clozeComplete(code, { "1": "54", "2": "  " })).toBe(false);
    expect(clozeComplete(code, { "1": "54", "2": "1" })).toBe(true);
  });
});

describe("stage templates", () => {
  it("every write-code stage starter is a well-formed cloze template", () => {
    for (const stage of DECODING_STAGES) {
      for (const [v, template] of [stage.starterCode, ...(stage.starterVariants ?? [])].entries()) {
        if (!template) continue;
        expect(hasCloze(template), `stage ${stage.index} variant ${v}`).toBe(true);
        const ids = parseCloze(template)
          .filter((p) => p.kind === "blank")
          .map((p) => (p.kind === "blank" ? p.id : ""));
        expect(new Set(ids).size, `stage ${stage.index} variant ${v} duplicate ids`).toBe(
          ids.length,
        );
      }
    }
  });

  it("starterCodeFor picks deterministically across the variant pool", () => {
    const stage = DECODING_STAGES.find((s) => s.index === 3)!;
    const pool = [stage.starterCode, ...(stage.starterVariants ?? [])];
    expect(starterCodeFor(stage, 0)).toBe(stage.starterCode);
    expect(starterCodeFor(stage, pool.length)).toBe(stage.starterCode);
    expect(starterCodeFor(stage, 1)).toBe(pool[1]);
    // A stage without variants always returns its starter.
    const noVariants = DECODING_STAGES.find((s) => s.index === 6)!;
    expect(starterCodeFor(noVariants, 7)).toBe(noVariants.starterCode);
  });
});
