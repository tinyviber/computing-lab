import type { RelationalScenario, RelationalScenarioId } from "./model";

export const RELATIONAL_SCENARIOS: Readonly<Record<RelationalScenarioId, RelationalScenario>> = {
  catalog: {
    id: "catalog",
    title: "Library catalog",
    today: "2026-01-15",
    tables: [
      {
        name: "books",
        columns: [
          { name: "id", type: "number" },
          { name: "title", type: "string" },
          { name: "author", type: "string" },
          { name: "year", type: "number" },
          { name: "available", type: "boolean" },
        ],
        rows: [
          {
            id: "book-1",
            values: {
              id: 1,
              title: "The Left Hand of Darkness",
              author: "Ursula K. Le Guin",
              year: 1969,
              available: true,
            },
          },
          {
            id: "book-2",
            values: {
              id: 2,
              title: "The Three-Body Problem",
              author: "Liu Cixin",
              year: 2008,
              available: true,
            },
          },
          {
            id: "book-3",
            values: {
              id: 3,
              title: "A Wizard of Earthsea",
              author: "Ursula K. Le Guin",
              year: 1968,
              available: false,
            },
          },
          {
            id: "book-4",
            values: {
              id: 4,
              title: "Hyperion",
              author: "Dan Simmons",
              year: 1989,
              available: false,
            },
          },
        ],
      },
      {
        name: "borrowers",
        columns: [
          { name: "id", type: "number" },
          { name: "name", type: "string" },
        ],
        rows: [
          { id: "person-1", values: { id: 1, name: "Ada" } },
          { id: "person-2", values: { id: 2, name: "Lin" } },
          { id: "person-3", values: { id: 3, name: "Kai" } },
        ],
      },
      {
        name: "loans",
        columns: [
          { name: "borrower_id", type: "number" },
          { name: "book_id", type: "number" },
          { name: "due", type: "date" },
        ],
        rows: [
          { id: "loan-1", values: { borrower_id: 1, book_id: 3, due: "2026-01-10" } },
          { id: "loan-2", values: { borrower_id: 2, book_id: 4, due: "2026-02-01" } },
          { id: "loan-3", values: { borrower_id: 3, book_id: 99, due: "2026-01-20" } },
        ],
      },
    ],
  },
};

export const DEFAULT_RELATIONAL_SCENARIO: RelationalScenarioId = "catalog";

export function getRelationalScenario(id: RelationalScenarioId): RelationalScenario {
  return RELATIONAL_SCENARIOS[id];
}
