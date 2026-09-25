/**
 * IPv4 helpers for the network lab: dotted-quad parsing, contiguous
 * prefix masks, subnet arithmetic and the derived "device MAC" used by
 * the simulator's L2 decisions.
 *
 * Addresses travel the wire as `{ ip, prefix }` pairs; everything in
 * here is pure so the browser preview and the server judge share the
 * same behaviour. Masks are accepted as a prefix length or a dotted
 * mask (`255.255.255.0`) and must be contiguous 1s — the lesson's
 * bound per issue #56.
 */

import { fnv1a } from "./rng.ts";

/** Dotted-quad text → 32-bit int, or null when malformed. */
export function parseIpv4(text: unknown): number | null {
  if (typeof text !== "string") return null;
  const parts = text.trim().split(".");
  if (parts.length !== 4) return null;
  let ip = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    ip = ip * 256 + octet;
  }
  return ip >>> 0;
}

export function formatIpv4(ip: number): string {
  return [(ip >>> 24) & 255, (ip >>> 16) & 255, (ip >>> 8) & 255, ip & 255].join(".");
}

export function maskBits(prefix: number): number {
  if (prefix <= 0) return 0;
  if (prefix >= 32) return 0xffffffff;
  return (0xffffffff << (32 - prefix)) >>> 0;
}

/**
 * Prefix length parser: accepts `"24"`, `"/24"`, `24` or a dotted mask
 * like `"255.255.255.0"`. Anything non-contiguous (`255.255.255.225`)
 * or out of range (`/33`) returns null.
 */
export function parsePrefix(text: unknown): number | null {
  if (typeof text === "number" && Number.isInteger(text) && text >= 0 && text <= 32) {
    return text;
  }
  if (typeof text !== "string") return null;
  const trimmed = text.trim().replace(/^\//, "");
  if (/^\d{1,2}$/.test(trimmed)) {
    const n = Number(trimmed);
    return n <= 32 ? n : null;
  }
  const dotted = parseIpv4(trimmed);
  if (dotted === null) return null;
  let prefix = 0;
  let seenZero = false;
  for (let i = 31; i >= 0; i -= 1) {
    const bit = (dotted >>> i) & 1;
    if (bit === 1) {
      if (seenZero) return null;
      prefix += 1;
    } else {
      seenZero = true;
    }
  }
  return prefix;
}

/** Dotted mask text for a prefix length: 24 → "255.255.255.0". */
export function formatMask(prefix: number): string {
  return formatIpv4(maskBits(prefix));
}

export function networkOf(ip: number, prefix: number): number {
  return (ip & maskBits(prefix)) >>> 0;
}

export function broadcastOf(ip: number, prefix: number): number {
  return (networkOf(ip, prefix) | (~maskBits(prefix) >>> 0)) >>> 0;
}

/** Does `b` sit inside `a`'s subnet? (Uses `a`'s mask, like a real host.) */
export function sameSubnet(a: number, b: number, prefix: number): boolean {
  return networkOf(a, prefix) === networkOf(b, prefix);
}

/**
 * Host-usable address check: /31 and /32 have no usable host space, so
 * they are accepted verbatim; shorter prefixes reserve the network and
 * broadcast addresses.
 */
export function isHostAddress(ip: number, prefix: number): boolean {
  if (prefix >= 31) return true;
  return ip !== networkOf(ip, prefix) && ip !== broadcastOf(ip, prefix);
}

/** Display helper: `"10.0.1.0/24"` for the subnet an address belongs to. */
export function describeSubnet(ip: number, prefix: number): string {
  return `${formatIpv4(networkOf(ip, prefix))}/${prefix}`;
}

/** Stable device MAC derived from node id + interface — deterministic across runs. */
export function macFor(nodeId: string, iface: string): string {
  const h = fnv1a(`${nodeId}|${iface}`);
  const b = (shift: number) => ((h >>> shift) & 255).toString(16).padStart(2, "0");
  return `02:00:5e:${b(16)}:${b(8)}:${b(0)}`;
}
