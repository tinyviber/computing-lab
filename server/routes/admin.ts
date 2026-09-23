import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { MAX_PASSWORD_LENGTH, hashPassword, minPasswordLength } from "../auth/password.ts";
import type { AccountRole } from "../auth/session.ts";
import { newId, withTransaction } from "../db/client.ts";
import { jsonError, requireAdmin, type AppVariables } from "../http/context.ts";

const STUDENT_NO = /^[A-Za-z0-9_-]{2,32}$/;
/** CSV/表格里常见的中文写法也接受。 */
const ROLE_ALIASES: Record<string, AccountRole> = {
  admin: "admin",
  管理员: "admin",
  teacher: "teacher",
  教师: "teacher",
  user: "user",
  学生: "user",
};

type ImportRow = {
  line: number;
  studentNo: string;
  name: string;
  password: string;
  role: AccountRole;
  inviteCode: string | null;
};

type ImportResult = {
  line: number;
  studentNo: string;
  status: "created" | "exists" | "error";
  error?: string;
};

function normalizeRole(raw: string | undefined): AccountRole | null {
  if (raw === undefined || raw.trim() === "") return "user";
  return ROLE_ALIASES[raw.trim()] ?? null;
}

/** One CSV row: 学号,姓名,密码[,角色][,班级邀请码]。逗号、全角逗号或 Tab 分隔。 */
function parseCsvLine(line: string): string[] {
  return line.split(/[\t,，]/).map((cell) => cell.trim());
}

function isHeaderRow(cells: string[]): boolean {
  return /学号|student/i.test(cells[0] ?? "") || /姓名|name/i.test(cells[1] ?? "");
}

function rowsFromCsv(csv: string): { rows: ImportRow[]; errors: ImportResult[] } {
  const rows: ImportRow[] = [];
  const errors: ImportResult[] = [];
  const lines = csv.split(/\r?\n/);
  let headerChecked = false;
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === "") return;
    const cells = parseCsvLine(line);
    if (!headerChecked) {
      headerChecked = true;
      if (isHeaderRow(cells)) return;
    }
    const [studentNo = "", name = "", password = "", roleRaw, inviteCode] = cells;
    const role = normalizeRole(roleRaw);
    if (role === null) {
      errors.push({ line: index + 1, studentNo, status: "error", error: "invalid-role" });
      return;
    }
    rows.push({
      line: index + 1,
      studentNo,
      name,
      password,
      role,
      inviteCode: inviteCode ? inviteCode : null,
    });
  });
  return { rows, errors };
}

function rowsFromJson(input: unknown): { rows: ImportRow[]; errors: ImportResult[] } | null {
  if (!Array.isArray(input)) return null;
  const rows: ImportRow[] = [];
  const errors: ImportResult[] = [];
  input.forEach((entry, index) => {
    const line = index + 1;
    if (!entry || typeof entry !== "object") {
      errors.push({ line, studentNo: "", status: "error", error: "invalid-row" });
      return;
    }
    const record = entry as Record<string, unknown>;
    const studentNo = typeof record.studentNo === "string" ? record.studentNo : "";
    const name = typeof record.name === "string" ? record.name : "";
    const password = typeof record.password === "string" ? record.password : "";
    const role = normalizeRole(typeof record.role === "string" ? record.role : undefined);
    if (role === null) {
      errors.push({ line, studentNo, status: "error", error: "invalid-role" });
      return;
    }
    const inviteCode =
      typeof record.inviteCode === "string" && record.inviteCode.trim() !== ""
        ? record.inviteCode.trim()
        : null;
    rows.push({ line, studentNo, name, password, role, inviteCode });
  });
  return { rows, errors };
}

function classByInviteCode(db: DatabaseSync, inviteCode: string) {
  return db.prepare("SELECT id, name FROM classes WHERE invite_code = ?").get(inviteCode) as
    { id: string; name: string } | undefined;
}

function validateAccount(row: {
  studentNo: string;
  name: string;
  password: string;
  role: AccountRole;
}): string | null {
  if (!STUDENT_NO.test(row.studentNo)) return "invalid-student-no";
  if (row.name.trim().length === 0 || row.name.length > 64) return "invalid-name";
  if (
    row.password.length < minPasswordLength(row.role) ||
    row.password.length > MAX_PASSWORD_LENGTH
  ) {
    return "weak-password";
  }
  return null;
}

/**
 * Insert one account + optional class membership. Returns an error code or
 * null. Runs its statements inside the caller's transaction — do NOT begin
 * one here (imports already hold the write lock).
 */
function createAccount(
  db: DatabaseSync,
  row: ImportRow,
  passwordHash: string,
): "exists" | string | null {
  const invalid = validateAccount(row);
  if (invalid) return invalid;
  const existing = db.prepare("SELECT id FROM users WHERE student_no = ?").get(row.studentNo);
  if (existing) return "exists";
  const klass = row.inviteCode ? classByInviteCode(db, row.inviteCode) : undefined;
  if (row.inviteCode && !klass) return "class-not-found";

  const userId = newId();
  db.prepare(
    "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
  ).run(userId, row.studentNo, row.name.trim(), passwordHash, row.role);
  if (klass) {
    const memberRole = row.role === "user" ? "student" : "teacher";
    db.prepare("INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, ?)").run(
      newId(),
      klass.id,
      userId,
      memberRole,
    );
  }
  return null;
}

export function adminRoutes() {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use("*", async (c, next) => {
    const auth = requireAdmin(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    return next();
  });

  app.get("/users", (c) => {
    const db = c.get("db");
    const rawPage = Number.parseInt(c.req.query("page") ?? "", 10);
    const rawSize = Number.parseInt(c.req.query("pageSize") ?? "", 10);
    const search = (c.req.query("search") ?? "").trim().slice(0, 64);
    const pageSize = Number.isFinite(rawSize) ? Math.min(Math.max(rawSize, 1), 200) : 50;
    const filter = search
      ? "WHERE instr(lower(student_no), lower(?)) > 0 OR instr(lower(name), lower(?)) > 0"
      : "";
    const filterArgs = search ? [search, search] : [];
    const { total } = db
      .prepare(`SELECT COUNT(*) AS total FROM users ${filter}`)
      .get(...filterArgs) as {
      total: number;
    };
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Number.isFinite(rawPage) ? Math.min(Math.max(rawPage, 1), pageCount) : 1;
    const users = db
      .prepare(
        `SELECT id, student_no AS studentNo, name, role, created_at AS createdAt
         FROM users ${filter} ORDER BY created_at, student_no LIMIT ? OFFSET ?`,
      )
      .all(...filterArgs, pageSize, (page - 1) * pageSize) as {
      id: string;
      studentNo: string;
      name: string;
      role: AccountRole;
      createdAt: string;
    }[];
    // Only this page's memberships are fetched — the join used to scan the
    // whole class_members table regardless of the current page.
    const userIds = users.map((u) => u.id);
    const placeholders = userIds.map(() => "?").join(", ");
    const memberships = userIds.length
      ? (db
          .prepare(
            `SELECT m.user_id AS userId, m.class_id AS classId, c.name AS className, m.role
             FROM class_members m JOIN classes c ON c.id = m.class_id
             WHERE m.user_id IN (${placeholders})`,
          )
          .all(...userIds) as {
          userId: string;
          classId: string;
          className: string;
          role: string;
        }[])
      : [];
    const classesByUser = new Map<string, { classId: string; className: string; role: string }[]>();
    for (const m of memberships) {
      const list = classesByUser.get(m.userId) ?? [];
      list.push({ classId: m.classId, className: m.className, role: m.role });
      classesByUser.set(m.userId, list);
    }
    return c.json({
      users: users.map((u) => ({ ...u, classes: classesByUser.get(u.id) ?? [] })),
      total,
      page,
      pageSize,
      search,
    });
  });

  // Create a single account. Self-registration is closed: this is the only
  // way new accounts come into existence.
  app.post("/users", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(c, 400, "invalid-body");
    const {
      studentNo,
      name,
      password,
      role: rawRole,
      classId,
      inviteCode,
    } = body as Record<string, unknown>;
    if (typeof studentNo !== "string" || typeof name !== "string" || typeof password !== "string") {
      return jsonError(c, 400, "invalid-body");
    }
    const role = normalizeRole(typeof rawRole === "string" ? rawRole : undefined);
    if (role === null) return jsonError(c, 400, "invalid-role");

    const db = c.get("db");
    let resolvedInvite: string | null = null;
    if (typeof classId === "string" && classId !== "") {
      const klass = db
        .prepare("SELECT invite_code AS inviteCode FROM classes WHERE id = ?")
        .get(classId) as { inviteCode: string } | undefined;
      if (!klass) return jsonError(c, 404, "class-not-found");
      resolvedInvite = klass.inviteCode;
    } else if (typeof inviteCode === "string" && inviteCode.trim() !== "") {
      resolvedInvite = inviteCode.trim();
    }

    const passwordHash = await hashPassword(password);
    const row: ImportRow = {
      line: 1,
      studentNo,
      name,
      password,
      role,
      inviteCode: resolvedInvite,
    };
    const outcome = withTransaction(db, () => createAccount(db, row, passwordHash));
    if (outcome === "exists") return jsonError(c, 409, "student-no-taken");
    if (outcome === "class-not-found") return jsonError(c, 404, "class-not-found");
    if (outcome !== null) return jsonError(c, 400, outcome);
    const created = db
      .prepare("SELECT id, student_no AS studentNo, name, role FROM users WHERE student_no = ?")
      .get(studentNo);
    return c.json({ user: created }, 201);
  });

  // Batch import: `{ csv }` with one `学号,姓名,密码[,角色][,班级邀请码]` per
  // line, or `{ users: [...] }` with the same fields as JSON objects.
  app.post("/users/import", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(c, 400, "invalid-body");
    const { csv, users } = body as { csv?: unknown; users?: unknown };

    let parsed: { rows: ImportRow[]; errors: ImportResult[] } | null = null;
    if (typeof csv === "string" && csv.trim() !== "") parsed = rowsFromCsv(csv);
    else if (users !== undefined) parsed = rowsFromJson(users);
    if (!parsed) return jsonError(c, 400, "invalid-import");

    const db = c.get("db");
    const results: ImportResult[] = [...parsed.errors];

    // Validate cheap fields first so hashing only happens for viable rows.
    const valid: { row: ImportRow; passwordHash: string }[] = [];
    for (const row of parsed.rows) {
      const invalid = validateAccount(row);
      if (invalid) {
        results.push({ line: row.line, studentNo: row.studentNo, status: "error", error: invalid });
      }
    }
    const hashable = parsed.rows.filter(
      (row) => !results.some((r) => r.line === row.line && r.status === "error"),
    );
    const hashes = await Promise.all(hashable.map((row) => hashPassword(row.password)));
    hashable.forEach((row, index) => valid.push({ row, passwordHash: hashes[index] }));

    // All inserts commit atomically: a mid-import crash cannot leave half a
    // roster behind. Duplicate student_nos stay "exists" per row.
    withTransaction(db, () => {
      for (const { row, passwordHash } of valid) {
        const outcome = createAccount(db, row, passwordHash);
        if (outcome === null) {
          results.push({ line: row.line, studentNo: row.studentNo, status: "created" });
        } else if (outcome === "exists") {
          results.push({ line: row.line, studentNo: row.studentNo, status: "exists" });
        } else {
          results.push({
            line: row.line,
            studentNo: row.studentNo,
            status: "error",
            error: outcome,
          });
        }
      }
    });
    results.sort((a, b) => a.line - b.line);
    return c.json({
      created: results.filter((r) => r.status === "created").length,
      exists: results.filter((r) => r.status === "exists").length,
      failed: results.filter((r) => r.status === "error").length,
      rows: results,
    });
  });

  // Edit an account's global role. The target role is limited to
  // teacher/user — admin accounts only ever come from seed, never from this
  // endpoint. Editing your own role is refused to prevent self-lockout.
  // Class memberships follow the new role so roster semantics stay coherent.
  app.put("/users/:id/role", async (c) => {
    const body = await c.req.json().catch(() => null);
    const rawRole =
      body && typeof body === "object" ? (body as Record<string, unknown>).role : undefined;
    const role = normalizeRole(typeof rawRole === "string" ? rawRole : undefined);
    if (role === null) return jsonError(c, 400, "invalid-role");
    if (role === "admin") return jsonError(c, 400, "admin-role-not-editable");

    const targetId = c.req.param("id");
    const caller = c.get("user")!;
    if (targetId === caller.id) return jsonError(c, 400, "cannot-edit-own-role");

    const db = c.get("db");
    const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(targetId) as
      { id: string; role: AccountRole } | undefined;
    if (!target) return jsonError(c, 404, "user-not-found");

    // Account role and member roles move together or not at all.
    withTransaction(db, () => {
      db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, targetId);
      db.prepare("UPDATE class_members SET role = ? WHERE user_id = ?").run(
        role === "teacher" ? "teacher" : "student",
        targetId,
      );
    });
    return c.json({ user: { id: targetId, role } });
  });

  // Reset another account's password. All of the target's sessions are
  // dropped so the old password cannot keep a live session going. Admins
  // change their own password through /api/auth/change-password instead —
  // resetting it here would delete the session they are calling from.
  app.put("/users/:id/password", async (c) => {
    const body = await c.req.json().catch(() => null);
    const password =
      body && typeof body === "object" ? (body as Record<string, unknown>).password : undefined;
    if (typeof password !== "string") return jsonError(c, 400, "invalid-body");

    const targetId = c.req.param("id");
    const caller = c.get("user")!;
    if (targetId === caller.id) return jsonError(c, 400, "cannot-edit-own-password");

    const db = c.get("db");
    const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(targetId) as
      { id: string; role: AccountRole } | undefined;
    if (!target) return jsonError(c, 404, "user-not-found");
    // The minimum depends on the target's role, not the caller's.
    if (password.length < minPasswordLength(target.role) || password.length > MAX_PASSWORD_LENGTH) {
      return jsonError(c, 400, "weak-password");
    }

    const passwordHash = await hashPassword(password);
    withTransaction(db, () => {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, targetId);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(targetId);
    });
    return c.json({ ok: true });
  });

  // Delete an account and everything attached to it — submissions, project
  // progress, memberships, sessions. Self-deletion is refused so an admin
  // cannot lock themselves out mid-session.
  app.delete("/users/:id", (c) => {
    const targetId = c.req.param("id");
    const caller = c.get("user")!;
    if (targetId === caller.id) return jsonError(c, 400, "cannot-delete-self");

    const db = c.get("db");
    const target = db.prepare("SELECT id FROM users WHERE id = ?").get(targetId);
    if (!target) return jsonError(c, 404, "user-not-found");

    // The whole cascade is one transaction — a partial delete would orphan
    // submissions/responses pointing at a missing user.
    withTransaction(db, () => {
      db.prepare("DELETE FROM submissions WHERE user_id = ?").run(targetId);
      db.prepare("DELETE FROM student_projects WHERE user_id = ?").run(targetId);
      // Task-sheet data: their answers, then every response on assignments they
      // created or that snapshot their sheets, then the assignments and sheets.
      db.prepare("DELETE FROM task_responses WHERE user_id = ?").run(targetId);
      db.prepare(
        `DELETE FROM task_responses WHERE assignment_id IN (
           SELECT a.id FROM task_assignments a
           LEFT JOIN task_sheets s ON s.id = a.sheet_id
           WHERE a.assigned_by = ? OR s.owner_user_id = ?)`,
      ).run(targetId, targetId);
      db.prepare(
        `DELETE FROM task_assignments
         WHERE assigned_by = ? OR sheet_id IN (SELECT id FROM task_sheets WHERE owner_user_id = ?)`,
      ).run(targetId, targetId);
      db.prepare("DELETE FROM task_sheets WHERE owner_user_id = ?").run(targetId);
      db.prepare("DELETE FROM class_members WHERE user_id = ?").run(targetId);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(targetId);
      db.prepare("DELETE FROM users WHERE id = ?").run(targetId);
    });
    return c.json({ deleted: targetId });
  });

  // Wipe one account's exercise records — every submission and lab project —
  // while keeping the account, role, and class memberships. The student sees
  // a fresh progress state on next login.
  app.delete("/users/:id/records", (c) => {
    const targetId = c.req.param("id");
    const db = c.get("db");
    const target = db.prepare("SELECT id FROM users WHERE id = ?").get(targetId);
    if (!target) return jsonError(c, 404, "user-not-found");

    let cleared = { submissions: 0, projects: 0, taskResponses: 0 };
    withTransaction(db, () => {
      cleared = {
        submissions: Number(
          db.prepare("DELETE FROM submissions WHERE user_id = ?").run(targetId).changes,
        ),
        projects: Number(
          db.prepare("DELETE FROM student_projects WHERE user_id = ?").run(targetId).changes,
        ),
        taskResponses: Number(
          db.prepare("DELETE FROM task_responses WHERE user_id = ?").run(targetId).changes,
        ),
      };
    });
    return c.json({ cleared });
  });

  app.get("/classes", (c) => {
    const classes = c
      .get("db")
      .prepare(
        `SELECT c.id, c.name, c.invite_code AS inviteCode,
                (SELECT COUNT(*) FROM class_members m WHERE m.class_id = c.id) AS memberCount
         FROM classes c ORDER BY c.name`,
      )
      .all();
    return c.json({ classes });
  });

  app.post("/classes", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(c, 400, "invalid-body");
    const { name, inviteCode: rawInvite } = body as Record<string, unknown>;
    if (typeof name !== "string" || name.trim().length === 0 || name.length > 64) {
      return jsonError(c, 400, "invalid-name");
    }
    const inviteCode =
      typeof rawInvite === "string" && rawInvite.trim() !== ""
        ? rawInvite.trim()
        : crypto.randomUUID().slice(0, 8).toUpperCase();
    if (!STUDENT_NO.test(inviteCode)) return jsonError(c, 400, "invalid-invite-code");
    const db = c.get("db");
    const conflict = db.prepare("SELECT id FROM classes WHERE invite_code = ?").get(inviteCode);
    if (conflict) return jsonError(c, 409, "invite-code-taken");
    const id = newId();
    db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
      id,
      name.trim(),
      inviteCode,
    );
    return c.json({ class: { id, name: name.trim(), inviteCode } }, 201);
  });

  // Delete a class. Only empty classes may be deleted — remove every member
  // first so a roster is never dropped silently.
  app.delete("/classes/:id", (c) => {
    const db = c.get("db");
    const classId = c.req.param("id");
    const klass = db.prepare("SELECT id FROM classes WHERE id = ?").get(classId);
    if (!klass) return jsonError(c, 404, "class-not-found");
    const { count } = db
      .prepare("SELECT COUNT(*) AS count FROM class_members WHERE class_id = ?")
      .get(classId) as { count: number };
    if (count > 0) return jsonError(c, 409, "class-not-empty");
    // Empty roster: task assignments and their responses are orphaned data
    // owned by the class — remove them before the FK-guarded class row.
    withTransaction(db, () => {
      db.prepare(
        `DELETE FROM task_responses WHERE assignment_id IN (
           SELECT id FROM task_assignments WHERE class_id = ?)`,
      ).run(classId);
      db.prepare("DELETE FROM task_assignments WHERE class_id = ?").run(classId);
      db.prepare("DELETE FROM classes WHERE id = ?").run(classId);
    });
    return c.json({ deleted: classId });
  });

  // Add a user to a class. Member role follows the account role: students
  // join as students, staff join as teachers.
  app.put("/classes/:classId/members/:userId", (c) => {
    const db = c.get("db");
    const classId = c.req.param("classId");
    const userId = c.req.param("userId");
    const klass = db.prepare("SELECT id FROM classes WHERE id = ?").get(classId);
    if (!klass) return jsonError(c, 404, "class-not-found");
    const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(userId) as
      { id: string; role: AccountRole } | undefined;
    if (!target) return jsonError(c, 404, "user-not-found");
    const existing = db
      .prepare("SELECT id FROM class_members WHERE class_id = ? AND user_id = ?")
      .get(classId, userId);
    if (existing) return jsonError(c, 409, "already-member");

    const memberRole = target.role === "user" ? "student" : "teacher";
    db.prepare("INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, ?)").run(
      newId(),
      classId,
      userId,
      memberRole,
    );
    return c.json({ membership: { classId, userId, role: memberRole } }, 201);
  });

  // Remove one user from a class. Users may belong to any number of classes,
  // including zero — membership rows are independent.
  app.delete("/classes/:classId/members/:userId", (c) => {
    const db = c.get("db");
    const classId = c.req.param("classId");
    const userId = c.req.param("userId");
    const klass = db.prepare("SELECT id FROM classes WHERE id = ?").get(classId);
    if (!klass) return jsonError(c, 404, "class-not-found");
    const result = db
      .prepare("DELETE FROM class_members WHERE class_id = ? AND user_id = ?")
      .run(classId, userId);
    if (result.changes === 0) return jsonError(c, 404, "membership-not-found");
    return c.json({ removed: { classId, userId } });
  });

  return app;
}
