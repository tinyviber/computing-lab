import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const schemaSql = readFileSync(resolve(here, "schema.sql"), "utf8");

export const dbPath = resolve(process.env.LAB_DB_PATH ?? resolve(here, "../../data/lab.db"));

let singleton: DatabaseSync | undefined;

/** Process-wide database handle (LAB_DB_PATH or ./data/lab.db). */
export function getDb(): DatabaseSync {
  if (!singleton) {
    mkdirSync(dirname(dbPath), { recursive: true });
    singleton = openDb(dbPath);
  }
  return singleton;
}

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

/** Test helper: isolated in-memory database. */
export function openMemoryDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

export function migrate(db: DatabaseSync): void {
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };
  if (version === 0) {
    db.exec(schemaSql);
    db.exec("PRAGMA user_version = 4");
    return;
  }
  // v1 -> v2: out-of-order stage passes replace the serial stage lock.
  if (version === 1) {
    db.exec("ALTER TABLE student_projects ADD COLUMN passed_stages TEXT NOT NULL DEFAULT '[]'");
  }
  // v2 -> v3: account-level roles (admin / teacher / user). Existing class
  // teachers keep their permissions via a global 'teacher' role backfill.
  if (version <= 2) {
    db.exec(
      "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' " +
        "CHECK (role IN ('admin', 'teacher', 'user'))",
    );
    db.exec(
      "UPDATE users SET role = 'teacher' " +
        "WHERE id IN (SELECT user_id FROM class_members WHERE role = 'teacher')",
    );
  }
  // v3 -> v4: task sheets — teacher-owned worksheet templates, class-scoped
  // assignments (schema snapshot at assign time), per-student responses.
  if (version === 3) {
    db.exec(`CREATE TABLE IF NOT EXISTS task_sheets (
      id            TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users (id),
      title         TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      schema_json   TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS task_assignments (
      id          TEXT PRIMARY KEY,
      sheet_id    TEXT REFERENCES task_sheets (id) ON DELETE SET NULL,
      class_id    TEXT NOT NULL REFERENCES classes (id),
      assigned_by TEXT NOT NULL REFERENCES users (id),
      title       TEXT NOT NULL,
      schema_json TEXT NOT NULL,
      due_at      TEXT,
      archived    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS task_responses (
      id             TEXT PRIMARY KEY,
      assignment_id  TEXT NOT NULL REFERENCES task_assignments (id),
      user_id        TEXT NOT NULL REFERENCES users (id),
      answers_json   TEXT NOT NULL DEFAULT '{}',
      auto_score     REAL,
      auto_total     REAL,
      grading_json   TEXT,
      review_json    TEXT,
      reviewed_by    TEXT,
      reviewed_at    TEXT,
      final_score    REAL,
      final_total    REAL,
      status         TEXT NOT NULL DEFAULT 'in_progress'
                     CHECK (status IN ('in_progress', 'submitted', 'reviewed', 'returned')),
      submitted_at   TEXT,
      updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (assignment_id, user_id)
    )`);
    db.exec("CREATE INDEX IF NOT EXISTS idx_task_sheets_owner ON task_sheets (owner_user_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_task_assignments_class ON task_assignments (class_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_task_assignments_sheet ON task_assignments (sheet_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_task_responses_user ON task_responses (user_id)");
  }
  if (version !== 4) db.exec("PRAGMA user_version = 4");
}

export function newId(): string {
  return crypto.randomUUID();
}
