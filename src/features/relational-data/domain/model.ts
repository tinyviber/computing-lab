export type RelationalScenarioId = "catalog";

export type RelationalValue = string | number | boolean;
export type RelationalColumn = { name: string; type: "string" | "number" | "boolean" | "date" };
export type RelationalRow = {
  id: string;
  values: Record<string, RelationalValue>;
};
export type RelationalTable = {
  name: string;
  columns: readonly RelationalColumn[];
  rows: readonly RelationalRow[];
};
export type RelationalScenario = {
  id: RelationalScenarioId;
  title: string;
  tables: readonly RelationalTable[];
  today: string;
};

export type RelationalQueryId =
  "all-books" | "available-books" | "overdue-loans" | "borrower-counts";

export type RelationalQueryRow = {
  id: string;
  values: Record<string, RelationalValue>;
};

export type RelationalProvenanceRow = {
  resultRowId: string;
  sourceIds: readonly string[];
  note: string;
};

export type RelationalQueryResult = {
  id: RelationalQueryId;
  title: string;
  description: string;
  explanation: string;
  columns: readonly string[];
  rows: readonly RelationalQueryRow[];
  provenance: readonly RelationalProvenanceRow[];
};

export type RelationalStatus = "running" | "complete";

export type RelationalMachine = {
  nextQueryIndex: number;
  status: RelationalStatus;
  results: RelationalQueryResult[];
};

export type RelationalSnapshot = RelationalMachine;

export type RelationalFrame = {
  index: number;
  before: RelationalSnapshot;
  after: RelationalSnapshot;
  queryId: RelationalQueryId;
  predictedRows?: number;
  result: RelationalQueryResult;
};

export type RelationalStepResult = {
  machine: RelationalMachine;
  frame?: RelationalFrame;
  done: boolean;
};

export type RelationalConstraintId =
  | "unique-books-id"
  | "books-year-range"
  | "borrowers-name-not-null"
  | "loans-borrower-fk"
  | "loans-book-fk";

export type RelationalConstraintResult = {
  id: RelationalConstraintId;
  table: string;
  description: string;
  passed: boolean;
  detail: string;
};

export const RELATIONAL_QUERY_SEQUENCE: readonly RelationalQueryId[] = [
  "all-books",
  "available-books",
  "overdue-loans",
  "borrower-counts",
];

const QUERY_META: Record<RelationalQueryId, { title: string; description: string }> = {
  "all-books": {
    title: "All books",
    description: "SELECT id, title, author, year, available FROM books",
  },
  "available-books": {
    title: "Available books",
    description: "SELECT * FROM books WHERE available = true",
  },
  "overdue-loans": {
    title: "Overdue loans",
    description: "SELECT * FROM loans JOIN borrowers JOIN books WHERE due < 2026-01-15",
  },
  "borrower-counts": {
    title: "Loans per borrower",
    description:
      "SELECT borrower, COUNT(*) AS loans FROM loans JOIN borrowers JOIN books GROUP BY borrower",
  },
};

function table(scenario: RelationalScenario, name: string): RelationalTable {
  const found = scenario.tables.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Relational scenario is missing table ${name}.`);
  return found;
}

function projectAllBooks(scenario: RelationalScenario): RelationalQueryResult {
  const books = table(scenario, "books");
  const rows = books.rows.map((row, index) => ({
    id: `row-${index + 1}`,
    values: { ...row.values },
  }));
  return {
    id: "all-books",
    title: QUERY_META["all-books"].title,
    description: QUERY_META["all-books"].description,
    explanation: "Every book row is projected with all of its columns; nothing is filtered.",
    columns: books.columns.map((column) => column.name),
    rows,
    provenance: rows.map((row, index) => ({
      resultRowId: row.id,
      sourceIds: [books.rows[index].id],
      note: "project",
    })),
  };
}

function filterAvailableBooks(scenario: RelationalScenario): RelationalQueryResult {
  const books = table(scenario, "books");
  const matched = books.rows.filter((row) => row.values.available === true);
  const rows = matched.map((row, index) => ({ id: `row-${index + 1}`, values: { ...row.values } }));
  return {
    id: "available-books",
    title: QUERY_META["available-books"].title,
    description: QUERY_META["available-books"].description,
    explanation:
      "Only rows with available = true pass the filter; the provenance names each matched book.",
    columns: books.columns.map((column) => column.name),
    rows,
    provenance: rows.map((row, index) => ({
      resultRowId: row.id,
      sourceIds: [matched[index].id],
      note: "filter available",
    })),
  };
}

function joinOverdueLoans(scenario: RelationalScenario): RelationalQueryResult {
  const loans = table(scenario, "loans");
  const borrowers = table(scenario, "borrowers");
  const books = table(scenario, "books");
  const borrowersById = new Map(borrowers.rows.map((row) => [String(row.values.id), row]));
  const booksById = new Map(books.rows.map((row) => [String(row.values.id), row]));
  const overdue = loans.rows.filter((row) => String(row.values.due) < scenario.today);
  const rows = overdue
    .map((loan, index) => {
      const borrower = borrowersById.get(String(loan.values.borrower_id));
      const book = booksById.get(String(loan.values.book_id));
      if (!borrower || !book) return undefined;
      return {
        id: `row-${index + 1}`,
        values: {
          loan: loan.id,
          borrower: borrower.values.name,
          book: book.values.title,
          due: loan.values.due,
        },
        source: [loan.id, borrower.id, book.id],
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
  return {
    id: "overdue-loans",
    title: QUERY_META["overdue-loans"].title,
    description: QUERY_META["overdue-loans"].description,
    explanation:
      "Each overdue loan is joined with its borrower and book; the provenance names all three source rows.",
    columns: ["loan", "borrower", "book", "due"],
    rows: rows.map(({ id, values }) => ({ id, values })),
    provenance: rows.map(({ id, source }) => ({
      resultRowId: id,
      sourceIds: source,
      note: "join",
    })),
  };
}

function aggregateBorrowerCounts(scenario: RelationalScenario): RelationalQueryResult {
  const loans = table(scenario, "loans");
  const borrowers = table(scenario, "borrowers");
  const books = table(scenario, "books");
  const borrowersById = new Map(borrowers.rows.map((row) => [String(row.values.id), row]));
  const booksById = new Map(books.rows.map((row) => [String(row.values.id), row]));
  const counts = new Map<string, { name: string; loanIds: string[] }>();
  for (const loan of loans.rows) {
    const borrower = borrowersById.get(String(loan.values.borrower_id));
    const book = booksById.get(String(loan.values.book_id));
    if (!borrower || !book) continue;
    const existing = counts.get(borrower.id) ?? { name: String(borrower.values.name), loanIds: [] };
    existing.loanIds.push(loan.id);
    counts.set(borrower.id, existing);
  }
  const entries = [...counts.values()];
  const rows = entries.map((entry, index) => ({
    id: `row-${index + 1}`,
    values: { borrower: entry.name, loans: entry.loanIds.length },
  }));
  return {
    id: "borrower-counts",
    title: QUERY_META["borrower-counts"].title,
    description: QUERY_META["borrower-counts"].description,
    explanation:
      "Loans are grouped by borrower over the full join; Kai's loan is absent because its book row is missing, so its count is derived only from valid joins.",
    columns: ["borrower", "loans"],
    rows,
    provenance: rows.map((row, index) => ({
      resultRowId: row.id,
      sourceIds: entries[index].loanIds,
      note: "aggregate over join",
    })),
  };
}

const QUERY_RUNNERS: Record<
  RelationalQueryId,
  (scenario: RelationalScenario) => RelationalQueryResult
> = {
  "all-books": projectAllBooks,
  "available-books": filterAvailableBooks,
  "overdue-loans": joinOverdueLoans,
  "borrower-counts": aggregateBorrowerCounts,
};

export function assertRelationalScenario(scenario: RelationalScenario): void {
  if (!scenario.title.trim()) throw new Error("Relational scenarios need a title.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scenario.today)) {
    throw new Error(`Invalid reference date: ${scenario.today}.`);
  }
  if (scenario.tables.length === 0) throw new Error("Relational scenarios need tables.");
  const ids = new Set<string>();
  for (const current of scenario.tables) {
    if (!current.name.trim()) throw new Error("Relational tables need names.");
    for (const column of current.columns) {
      if (!column.name.trim()) throw new Error("Relational columns need names.");
      if (!["string", "number", "boolean", "date"].includes(column.type)) {
        throw new Error(`Unknown column type: ${column.type}.`);
      }
    }
    for (const row of current.rows) {
      if (ids.has(row.id)) throw new Error(`Duplicate row id: ${row.id}.`);
      ids.add(row.id);
    }
  }
}

export function runRelationalQuery(
  id: RelationalQueryId,
  scenario: RelationalScenario,
): RelationalQueryResult {
  assertRelationalScenario(scenario);
  const runner = QUERY_RUNNERS[id];
  if (!runner) throw new Error(`Unknown relational query: ${id}.`);
  return runner(scenario);
}

function cloneMachine(machine: RelationalMachine): RelationalMachine {
  return {
    ...machine,
    results: machine.results.map((result) => ({
      ...result,
      rows: result.rows.map((row) => ({ ...row, values: { ...row.values } })),
      provenance: result.provenance.map((entry) => ({ ...entry, sourceIds: [...entry.sourceIds] })),
    })),
  };
}

function snapshot(machine: RelationalMachine): RelationalSnapshot {
  return cloneMachine(machine);
}

export function createRelationalMachine(scenario: RelationalScenario): RelationalMachine {
  assertRelationalScenario(scenario);
  return { nextQueryIndex: 0, status: "running", results: [] };
}

export function stepRelational(
  machine: RelationalMachine,
  scenario: RelationalScenario,
  predictedRows?: number,
): RelationalStepResult {
  assertRelationalScenario(scenario);
  if (machine.status === "complete") return { machine, done: true };
  const queryId = RELATIONAL_QUERY_SEQUENCE[machine.nextQueryIndex];
  if (!queryId) throw new Error("A running relational machine needs a next query.");

  const before = snapshot(machine);
  const result = runRelationalQuery(queryId, scenario);
  const nextIndex = machine.nextQueryIndex + 1;
  const next: RelationalMachine = {
    nextQueryIndex: nextIndex,
    status: nextIndex >= RELATIONAL_QUERY_SEQUENCE.length ? "complete" : "running",
    results: [...machine.results, result],
  };
  const after = snapshot(next);
  return {
    machine: next,
    frame: {
      index: machine.nextQueryIndex,
      before,
      after,
      queryId,
      predictedRows,
      result,
    },
    done: next.status === "complete",
  };
}

export function runRelational(scenario: RelationalScenario): {
  machine: RelationalMachine;
  frames: RelationalFrame[];
} {
  let machine = createRelationalMachine(scenario);
  const frames: RelationalFrame[] = [];
  for (let index = 0; index < RELATIONAL_QUERY_SEQUENCE.length; index += 1) {
    const result = stepRelational(machine, scenario);
    if (!result.frame) throw new Error("A running relational step must produce a frame.");
    frames.push(result.frame);
    machine = result.machine;
  }
  return { machine, frames };
}

export function validateRelational(scenario: RelationalScenario): RelationalConstraintResult[] {
  assertRelationalScenario(scenario);
  const books = table(scenario, "books");
  const borrowers = table(scenario, "borrowers");
  const loans = table(scenario, "loans");

  const bookIds = new Set(books.rows.map((row) => String(row.values.id)));
  const borrowerIds = new Set(borrowers.rows.map((row) => String(row.values.id)));

  const uniqueBooksId = (() => {
    const seen = new Set<string>();
    for (const row of books.rows) {
      const value = row.values.id;
      if (value === undefined) return { passed: false, detail: "books.id is missing." };
      const key = String(value);
      if (seen.has(key)) return { passed: false, detail: `duplicate id ${key}.` };
      seen.add(key);
    }
    return { passed: true, detail: "all book ids are unique." };
  })();

  const booksYearRange = (() => {
    const invalid = books.rows.find((row) => {
      const year = row.values.year;
      return typeof year !== "number" || year < 1900;
    });
    return invalid
      ? { passed: false, detail: `book ${invalid.id} has year ${String(invalid.values.year)}.` }
      : { passed: true, detail: "all book years are at least 1900." };
  })();

  const borrowersNameNotNull = (() => {
    const invalid = borrowers.rows.find((row) => {
      const name = row.values.name;
      return typeof name !== "string" || name.trim() === "";
    });
    return invalid
      ? { passed: false, detail: `borrower ${invalid.id} has an empty name.` }
      : { passed: true, detail: "every borrower has a name." };
  })();

  const loansBorrowerFk = (() => {
    const invalid = loans.rows.find((row) => !borrowerIds.has(String(row.values.borrower_id)));
    return invalid
      ? {
          passed: false,
          detail: `loan ${invalid.id} references missing borrower ${String(invalid.values.borrower_id)}.`,
        }
      : { passed: true, detail: "every loan references an existing borrower." };
  })();

  const loansBookFk = (() => {
    const invalid = loans.rows.find((row) => !bookIds.has(String(row.values.book_id)));
    return invalid
      ? {
          passed: false,
          detail: `loan ${invalid.id} references missing book ${String(invalid.values.book_id)}.`,
        }
      : { passed: true, detail: "every loan references an existing book." };
  })();

  return [
    {
      id: "unique-books-id",
      table: "books",
      description: "books.id is unique",
      ...uniqueBooksId,
    },
    {
      id: "books-year-range",
      table: "books",
      description: "books.year >= 1900",
      ...booksYearRange,
    },
    {
      id: "borrowers-name-not-null",
      table: "borrowers",
      description: "borrowers.name is not null",
      ...borrowersNameNotNull,
    },
    {
      id: "loans-borrower-fk",
      table: "loans",
      description: "loans.borrower_id references borrowers.id",
      ...loansBorrowerFk,
    },
    {
      id: "loans-book-fk",
      table: "loans",
      description: "loans.book_id references books.id",
      ...loansBookFk,
    },
  ];
}
