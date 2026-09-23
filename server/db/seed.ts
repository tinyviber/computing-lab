/**
 * Seed: one class + one admin + one teacher account. Idempotent — safe to re-run.
 *
 *   node server/db/seed.ts
 *   LAB_SEED_CLASS_NAME="2026-高一信息技术-01" LAB_SEED_INVITE_CODE=CLASS26 \
 *   LAB_ADMIN_STUDENT_NO=admin LAB_ADMIN_NAME="管理员" LAB_ADMIN_PASSWORD=changeme \
 *   LAB_TEACHER_STUDENT_NO=teacher LAB_TEACHER_NAME="王老师" \
 *   LAB_TEACHER_PASSWORD=changeme node server/db/seed.ts
 */

import { getDb, newId } from "./client.ts";
import { hashPassword } from "../auth/password.ts";
import type { AccountRole } from "../auth/session.ts";

const className = process.env.LAB_SEED_CLASS_NAME ?? "2026-高一信息技术-01";
const inviteCode = process.env.LAB_SEED_INVITE_CODE ?? "CLASS26";
const adminNo = process.env.LAB_ADMIN_STUDENT_NO ?? "admin";
const adminName = process.env.LAB_ADMIN_NAME ?? "管理员";
const adminPassword = process.env.LAB_ADMIN_PASSWORD ?? "admin-dev-password";
const teacherNo = process.env.LAB_TEACHER_STUDENT_NO ?? "teacher";
const teacherName = process.env.LAB_TEACHER_NAME ?? "教师";
const teacherPassword = process.env.LAB_TEACHER_PASSWORD ?? "teacher-dev-password";

const db = getDb();

let klass = db.prepare("SELECT id FROM classes WHERE invite_code = ?").get(inviteCode) as
  { id: string } | undefined;
if (!klass) {
  const id = newId();
  db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
    id,
    className,
    inviteCode,
  );
  klass = { id };
  console.log(`[seed] class "${className}" created, invite code: ${inviteCode}`);
} else {
  console.log(`[seed] class exists (invite: ${inviteCode})`);
}

/** Create the account if missing; always enforce the target global role. */
async function ensureAccount(studentNo: string, name: string, password: string, role: AccountRole) {
  const existing = db.prepare("SELECT id, role FROM users WHERE student_no = ?").get(studentNo) as
    { id: string; role: AccountRole } | undefined;
  if (!existing) {
    const id = newId();
    db.prepare(
      "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
    ).run(id, studentNo, name, await hashPassword(password), role);
    console.log(`[seed] ${role} "${name}" (${studentNo}) created`);
    return { id };
  }
  if (existing.role !== role) {
    db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, existing.id);
    console.log(`[seed] "${studentNo}" role upgraded to ${role}`);
  }
  return existing;
}

await ensureAccount(adminNo, adminName, adminPassword, "admin");
const teacher = await ensureAccount(teacherNo, teacherName, teacherPassword, "teacher");

const membership = db
  .prepare("SELECT id, role FROM class_members WHERE class_id = ? AND user_id = ?")
  .get(klass.id, teacher.id) as { id: string; role: string } | undefined;
if (!membership) {
  db.prepare(
    "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, 'teacher')",
  ).run(newId(), klass.id, teacher.id);
  console.log("[seed] teacher membership added");
} else if (membership.role !== "teacher") {
  db.prepare("UPDATE class_members SET role = 'teacher' WHERE id = ?").run(membership.id);
  console.log("[seed] membership upgraded to teacher");
}
