-- Minimal Lab Runtime schema (SQLite / node:sqlite).
-- Mirrors the spec'd Prisma models one-to-one; naming is snake_case.
-- Additive changes only: bump PRAGMA user_version and add a migration step in client.ts.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  student_no    TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS classes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS class_members (
  id       TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes (id),
  user_id  TEXT NOT NULL REFERENCES users (id),
  role     TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher')),
  UNIQUE (class_id, user_id)
);

CREATE TABLE IF NOT EXISTS student_projects (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users (id),
  class_id            TEXT NOT NULL,
  lab_id              TEXT NOT NULL,
  current_stage       INTEGER NOT NULL DEFAULT 1,
  passed_stages       TEXT NOT NULL DEFAULT '[]',
  unlocked_submodules TEXT NOT NULL DEFAULT '[]',
  draft_graph         TEXT NOT NULL DEFAULT '{}',
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, lab_id)
);

CREATE TABLE IF NOT EXISTS submissions (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES student_projects (id),
  user_id        TEXT NOT NULL REFERENCES users (id),
  lab_id         TEXT NOT NULL,
  stage_index    INTEGER NOT NULL,
  snapshot_graph TEXT NOT NULL,
  score          INTEGER NOT NULL,
  total          INTEGER NOT NULL,
  passed         INTEGER NOT NULL,
  test_summary   TEXT NOT NULL,
  submitted_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submissions_project_stage ON submissions (project_id, stage_index);
CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions (user_id, lab_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_class_members_user ON class_members (user_id);
