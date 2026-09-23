import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { AccountRole } from "./session.ts";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;
const KEY_LENGTH = 64;

export const MAX_PASSWORD_LENGTH = 128;

/** Staff accounts hold the keys to every class — hold them to a longer minimum. */
export function minPasswordLength(role: AccountRole): number {
  return role === "user" ? 4 : 8;
}

// Async scrypt: hashing is deliberately expensive, and the sync variant would
// stall the single-process event loop on every login/import.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hex] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  const derived = await scryptAsync(password, salt, expected.length);
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
