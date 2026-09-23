import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate, SCHEMA_VERSION } from "./client.ts";

const here = dirname(fileURLToPath(import.meta.url));
const schemaSql = readFileSync(resolve(here, "schema.sql"), "utf8");

/**
 * Rebuild a database as it looked at `version`: apply today's schema, then
 * strip every object that did not exist yet. Cheaper and more faithful than
 * hand-writing historical DDL.
 */
function fixtureDb(version: number): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(schemaSql);
  if (version < 5) db.exec("DROP INDEX IF EXISTS idx_submissions_user_stage");
  if (version < 4) {
    db.exec("DROP TABLE task_responses");
    db.exec("DROP TABLE task_assignments");
    db.exec("DROP TABLE task_sheets");
  }
  if (version < 3) db.exec("ALTER TABLE users DROP COLUMN role");
  if (version < 2) db.exec("ALTER TABLE student_projects DROP COLUMN passed_stages");
  db.exec(`PRAGMA user_version = ${version}`);
  return db;
}

const versionOf = (db: DatabaseSync) =>
  (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;

const tableExists = (db: DatabaseSync, name: string) =>
  db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !==
  undefined;

describe("migrate", () => {
  it.each([1, 2, 3, 4])("upgrades a v%i database to the current schema", (version) => {
    const db = fixtureDb(version);
    migrate(db);

    expect(versionOf(db)).toBe(SCHEMA_VERSION);
    for (const table of ["task_sheets", "task_assignments", "task_responses"]) {
      expect(tableExists(db, table), table).toBe(true);
    }
    // v2/v3 columns exist after the chain ran.
    expect(db.prepare("SELECT passed_stages FROM student_projects LIMIT 0")).toBeDefined();
    expect(db.prepare("SELECT role FROM users LIMIT 0")).toBeDefined();
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
        .get("idx_submissions_user_stage"),
    ).toBeDefined();
    db.close();
  });

  it("migrates a real v3 database whose rows survive the chain", () => {
    const db = fixtureDb(3);
    db.prepare("INSERT INTO classes (id, name, invite_code) VALUES ('c1', 'class', 'inv')").run();
    db.prepare(
      "INSERT INTO users (id, student_no, name, password_hash, role) VALUES ('u1', 'no1', 'n', 'h', 'teacher')",
    ).run();
    db.prepare(
      "INSERT INTO student_projects (id, user_id, class_id, lab_id) VALUES ('p1', 'u1', 'c1', 'calculator')",
    ).run();

    migrate(db);

    expect(versionOf(db)).toBe(SCHEMA_VERSION);
    expect(tableExists(db, "task_sheets")).toBe(true);
    expect(
      (
        db.prepare("SELECT passed_stages FROM student_projects WHERE id = 'p1'").get() as {
          passed_stages: string;
        }
      ).passed_stages,
    ).toBe("[]");
    db.close();
  });

  it("leaves a current database untouched", () => {
    const db = fixtureDb(SCHEMA_VERSION);
    migrate(db);
    expect(versionOf(db)).toBe(SCHEMA_VERSION);
    db.close();
  });

  it("completes a database half-migrated by an older build", () => {
    // Simulate the pre-transactional failure mode: passed_stages was added but
    // the process died before stamping the version, so the next migrate must
    // skip the applied ALTER instead of dying on a duplicate column.
    const db = fixtureDb(1);
    db.exec("ALTER TABLE student_projects ADD COLUMN passed_stages TEXT NOT NULL DEFAULT '[]'");
    db.exec("PRAGMA user_version = 1");

    migrate(db);

    expect(versionOf(db)).toBe(SCHEMA_VERSION);
    expect(tableExists(db, "task_sheets")).toBe(true);
    db.close();
  });

  it("rolls back the whole chain when a step fails", () => {
    // student_projects missing makes the v2 ALTER fail mid-chain; the version
    // stamp and every later step must roll back together.
    const db = fixtureDb(1);
    db.exec("DROP TABLE student_projects");
    try {
      expect(() => migrate(db)).toThrow();
      expect(versionOf(db)).toBe(1);
      expect(
        () => db.prepare("SELECT role FROM users LIMIT 0"),
        "v3 step should have rolled back",
      ).toThrow();
      expect(tableExists(db, "task_sheets"), "v4 step should have rolled back").toBe(false);
    } finally {
      db.close();
    }
  });
});
