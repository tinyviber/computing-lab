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
    db.exec("PRAGMA user_version = 2");
    return;
  }
  // v1 -> v2: out-of-order stage passes replace the serial stage lock.
  if (version === 1) {
    db.exec("ALTER TABLE student_projects ADD COLUMN passed_stages TEXT NOT NULL DEFAULT '[]'");
    db.exec("PRAGMA user_version = 2");
  }
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
