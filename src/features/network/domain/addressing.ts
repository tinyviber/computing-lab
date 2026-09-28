/**
 * IPv4 addressing helpers for the network lab — pure 32-bit integer
 * arithmetic so the browser preview and the server judge agree bit for
 * bit. Accepts both "/24" and dotted "255.255.255.0" mask spellings;
 * the canonical form everywhere inside the domain is a prefix length.
 */

export type IpAddr = number; // unsigned 32-bit

/** "203.0.113.9" → u32, or null on any malformed/overflowing octet. */
export function parseIp(text: unknown): IpAddr | null {
  if (typeof text !== "string") return null;
  const parts = text.trim().split(".");
  if (parts.length !== 4) return null;
  let ip = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    ip = (ip << 8) | octet;
  }
  return ip >>> 0;
}

export function formatIp(ip: IpAddr): string {
  return [(ip >>> 24) & 255, (ip >>> 16) & 255, (ip >>> 8) & 255, ip & 255].join(".");
}

/** "/24" or "255.255.255.0" → prefix length, or null. Dotted form must be contiguous 1s. */
export function parseMask(text: unknown): number | null {
  if (typeof text === "number" && Number.isInteger(text) && text >= 0 && text <= 32) return text;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (trimmed.startsWith("/")) {
    const n = Number(trimmed.slice(1));
    return Number.isInteger(n) && n >= 0 && n <= 32 ? n : null;
  }
  const dotted = parseIp(trimmed);
  if (dotted === null) return null;
  // Contiguous-ones check: a mask is 32 leading 1s; ~mask+1 must be a power of two.
  const inv = ~dotted >>> 0;
  if (inv === 0) return 32;
  if ((inv & (inv + 1)) !== 0) return null;
  return 32 - Math.log2(inv + 1);
}

export function formatMask(prefix: number): string {
  if (prefix <= 0) return "0.0.0.0";
  const mask = prefix === 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0;
  return formatIp(mask >>> 0);
}

export function maskBits(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

/** Network number of `ip` under `prefix`. */
export function networkOf(ip: IpAddr, prefix: number): IpAddr {
  return (ip & maskBits(prefix)) >>> 0;
}

export function broadcastOf(ip: IpAddr, prefix: number): IpAddr {
  const mask = maskBits(prefix);
  return ((ip & mask) | (~mask >>> 0)) >>> 0;
}

/** Same-subnet test as the sending host computes it — under ITS OWN mask. */
export function sameSubnet(myIp: IpAddr, myPrefix: number, dstIp: IpAddr): boolean {
  return networkOf(myIp, myPrefix) === networkOf(dstIp, myPrefix);
}

/**
 * A host-usable address: not the network or broadcast of its own subnet.
 * /31 and /32 are accepted whole (point-to-point links need /30 anyway —
 * the tighter bound is a teaching choice, not a hard protocol rule).
 */
export function isUsableHost(ip: IpAddr, prefix: number): boolean {
  if (prefix >= 31) return true;
  return ip !== networkOf(ip, prefix) && ip !== broadcastOf(ip, prefix);
}

/** "10.2.0.0/24" → {network, prefix}; host bits must be zero (a real prefix, not a host). */
export function parseCidr(text: unknown): { network: IpAddr; prefix: number } | null {
  if (typeof text !== "string") return null;
  const slash = text.trim().indexOf("/");
  if (slash < 0) return null;
  const ip = parseIp(text.slice(0, slash));
  const prefix = parseMask(text.slice(slash));
  if (ip === null || prefix === null) return null;
  const network = networkOf(ip, prefix);
  if (network !== ip) return null;
  return { network, prefix };
}

export function formatCidr(network: IpAddr, prefix: number): string {
  return `${formatIp(network)}/${prefix}`;
}

export type RouteEntry = { network: IpAddr; prefix: number; nextHop: IpAddr };

/** Longest-prefix match; `null` when no route (not even a default) covers dst. */
export function longestPrefixMatch(
  routes: readonly RouteEntry[],
  dstIp: IpAddr,
): RouteEntry | null {
  let best: RouteEntry | null = null;
  for (const route of routes) {
    if (networkOf(dstIp, route.prefix) !== route.network) continue;
    if (!best || route.prefix > best.prefix) best = route;
  }
  return best;
}

/**
 * A readable subnet tag for a link/port pair, e.g. "10.7.1.0/24".
 * Both ends configured → their subnets must match (checked separately);
 * one end → that end's subnet; none → null.
 */
export function subnetTagOf(ip: IpAddr | null, prefix: number | null): string | null {
  if (ip === null || prefix === null) return null;
  return formatCidr(networkOf(ip, prefix), prefix);
}
