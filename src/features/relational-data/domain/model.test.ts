import { describe, expect, it } from "vitest";
import {
  RELATIONAL_QUERY_SEQUENCE,
  createRelationalMachine,
  getRelationalScenario,
  runRelational,
  runRelationalQuery,
  stepRelational,
  validateRelational,
} from "./index";

describe("Relational Data domain", () => {
  it("hand-authors projection, filter, join, and aggregate results with provenance", () => {
    const scenario = getRelationalScenario("catalog");

    const all = runRelationalQuery("all-books", scenario);
    expect(all.rows).toHaveLength(4);
    expect(all.rows[0].values).toEqual({
      id: 1,
      title: "The Left Hand of Darkness",
      author: "Ursula K. Le Guin",
      year: 1969,
      available: true,
    });
    expect(all.provenance.map((entry) => entry.sourceIds)).toEqual([
      ["book-1"],
      ["book-2"],
      ["book-3"],
      ["book-4"],
    ]);

    const available = runRelationalQuery("available-books", scenario);
    expect(available.rows.map((row) => row.values.title)).toEqual([
      "The Left Hand of Darkness",
      "The Three-Body Problem",
    ]);
    expect(available.provenance.map((entry) => entry.sourceIds)).toEqual([["book-1"], ["book-2"]]);

    const overdue = runRelationalQuery("overdue-loans", scenario);
    expect(overdue.rows).toEqual([
      {
        id: "row-1",
        values: {
          loan: "loan-1",
          borrower: "Ada",
          book: "A Wizard of Earthsea",
          due: "2026-01-10",
        },
      },
    ]);
    expect(overdue.provenance[0].sourceIds).toEqual(["loan-1", "person-1", "book-3"]);

    const counts = runRelationalQuery("borrower-counts", scenario);
    expect(counts.rows).toEqual([
      { id: "row-1", values: { borrower: "Ada", loans: 1 } },
      { id: "row-2", values: { borrower: "Lin", loans: 1 } },
    ]);
    expect(counts.provenance.map((entry) => entry.sourceIds)).toEqual([["loan-1"], ["loan-2"]]);
    expect(counts.explanation).toMatch(/Kai/);
  });

  it("hand-authors all five constraint outcomes with one FK failure", () => {
    const results = validateRelational(getRelationalScenario("catalog"));

    expect(results.map((result) => [result.id, result.passed])).toEqual([
      ["unique-books-id", true],
      ["books-year-range", true],
      ["borrowers-name-not-null", true],
      ["loans-borrower-fk", true],
      ["loans-book-fk", false],
    ]);
    const failing = results.find((result) => result.id === "loans-book-fk")!;
    expect(failing.detail).toMatch(/loan-3/);
    expect(failing.detail).toMatch(/99/);
  });

  it("uses one query per pure step and preserves terminal identity", () => {
    const scenario = getRelationalScenario("catalog");
    const first = stepRelational(createRelationalMachine(scenario), scenario);
    const complete = runRelational(scenario);
    const after = stepRelational(complete.machine, scenario);

    expect(first.frame?.queryId).toBe("all-books");
    expect(first.machine.nextQueryIndex).toBe(1);
    expect(first.machine.status).toBe("running");
    expect(complete.frames.map((frame) => frame.queryId)).toEqual(RELATIONAL_QUERY_SEQUENCE);
    expect(complete.machine.status).toBe("complete");
    expect(after.machine).toBe(complete.machine);
    expect(after.frame).toBeUndefined();
    expect(after.done).toBe(true);
  });

  it("rejects malformed scenarios", () => {
    const scenario = getRelationalScenario("catalog");
    expect(() => runRelational({ ...scenario, today: "15/01/2026" })).toThrow(/date/i);
    expect(() => runRelational({ ...scenario, title: "" })).toThrow(/title/i);
    expect(() =>
      runRelational({
        ...scenario,
        tables: [
          {
            ...scenario.tables[0],
            columns: [{ name: "id", type: "mystery" as never }],
          },
          scenario.tables[1],
          scenario.tables[2],
        ],
      }),
    ).toThrow(/column type/i);
    expect(() =>
      runRelational({
        ...scenario,
        tables: [
          scenario.tables[0],
          scenario.tables[1],
          { ...scenario.tables[2], rows: [...scenario.tables[2].rows, scenario.tables[2].rows[0]] },
        ],
      }),
    ).toThrow(/duplicate row id/i);
  });

  it("keeps snapshots and result evidence independent", () => {
    const result = runRelational(getRelationalScenario("catalog"));
    const firstAfter = result.frames[0].after as {
      results: Array<{ rows: Array<{ values: Record<string, unknown> }> }>;
    };
    firstAfter.results[0].rows[0].values.title = "mutated";

    expect(result.frames[1].before.results[0].rows[0].values.title).toBe(
      "The Left Hand of Darkness",
    );
    expect(result.machine.results[0].rows[0].values.title).toBe("The Left Hand of Darkness");
  });
});
