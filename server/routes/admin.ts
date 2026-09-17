import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { hashPassword } from "../auth/password.ts";
import type { AccountRole } from "../auth/session.ts";
import { newId } from "../db/client.ts";
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
}): string | null {
  if (!STUDENT_NO.test(row.studentNo)) return "invalid-student-no";
  if (row.name.trim().length === 0 || row.name.length > 64) return "invalid-name";
  if (row.password.length < 4 || row.password.length > 128) return "weak-password";
  return null;
}

/** Insert one account + optional class membership. Returns an error code or null. */
function createAccount(db: DatabaseSync, row: ImportRow): "exists" | string | null {
  const invalid = validateAccount(row);
  if (invalid) return invalid;
  const existing = db.prepare("SELECT id FROM users WHERE student_no = ?").get(row.studentNo);
  if (existing) return "exists";
  const klass = row.inviteCode ? classByInviteCode(db, row.inviteCode) : undefined;
  if (row.inviteCode && !klass) return "class-not-found";

  const userId = newId();
  db.prepare(
    "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
  ).run(userId, row.studentNo, row.name.trim(), hashPassword(row.password), row.role);
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
    const users = db
      .prepare(
        `SELECT id, student_no AS studentNo, name, role, created_at AS createdAt
         FROM users ORDER BY created_at, student_no`,
      )
      .all() as {
      id: string;
      studentNo: string;
      name: string;
      role: AccountRole;
      createdAt: string;
    }[];
    const memberships = db
      .prepare(
        `SELECT m.user_id AS userId, m.class_id AS classId, c.name AS className, m.role
         FROM class_members m JOIN classes c ON c.id = m.class_id`,
      )
      .all() as { userId: string; classId: string; className: string; role: string }[];
    const classesByUser = new Map<string, { classId: string; className: string; role: string }[]>();
    for (const m of memberships) {
      const list = classesByUser.get(m.userId) ?? [];
      list.push({ classId: m.classId, className: m.className, role: m.role });
      classesByUser.set(m.userId, list);
    }
    return c.json({ users: users.map((u) => ({ ...u, classes: classesByUser.get(u.id) ?? [] })) });
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

    const outcome = createAccount(db, {
      line: 1,
      studentNo,
      name,
      password,
      role,
      inviteCode: resolvedInvite,
    });
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
    for (const row of parsed.rows) {
      const outcome = createAccount(db, row);
      if (outcome === null) {
        results.push({ line: row.line, studentNo: row.studentNo, status: "created" });
      } else if (outcome === "exists") {
        results.push({ line: row.line, studentNo: row.studentNo, status: "exists" });
      } else {
        results.push({ line: row.line, studentNo: row.studentNo, status: "error", error: outcome });
      }
    }
    results.sort((a, b) => a.line - b.line);
    return c.json({
      created: results.filter((r) => r.status === "created").length,
      exists: results.filter((r) => r.status === "exists").length,
      failed: results.filter((r) => r.status === "error").length,
      rows: results,
    });
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

  return app;
}
