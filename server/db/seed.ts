/**
 * Seed: one class + one teacher account. Idempotent — safe to re-run.
 *
 *   node server/db/seed.ts
 *   LAB_SEED_CLASS_NAME="2026-高一信息技术-01" LAB_SEED_INVITE_CODE=CLASS26 \
 *   LAB_TEACHER_STUDENT_NO=teacher LAB_TEACHER_NAME="王老师" \
 *   LAB_TEACHER_PASSWORD=changeme node server/db/seed.ts
 */

import { getDb, newId } from "./client.ts";
import { hashPassword } from "../auth/password.ts";

const className = process.env.LAB_SEED_CLASS_NAME ?? "2026-高一信息技术-01";
const inviteCode = process.env.LAB_SEED_INVITE_CODE ?? "CLASS26";
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

let teacher = db.prepare("SELECT id FROM users WHERE student_no = ?").get(teacherNo) as
  { id: string } | undefined;
if (!teacher) {
  const id = newId();
  db.prepare("INSERT INTO users (id, student_no, name, password_hash) VALUES (?, ?, ?, ?)").run(
    id,
    teacherNo,
    teacherName,
    hashPassword(teacherPassword),
  );
  teacher = { id };
  console.log(`[seed] teacher "${teacherName}" (${teacherNo}) created`);
}

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
