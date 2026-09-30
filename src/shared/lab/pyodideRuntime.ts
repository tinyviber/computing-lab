/**
 * Shared Pyodide runtime loader for the lab workers.
 *
 * The runtime (pyodide.asm.wasm + python_stdlib.zip + helpers, ~13 MB
 * unpacked) is by far the heaviest download in the app — a class of students
 * cold-loading it at once saturates the origin's bandwidth. Workers therefore
 * try public npm CDNs for the pinned release first and only fall back to the
 * vendored copy when every mirror fails or stalls. The vendored path carries
 * the package version so the deploy can mark it immutable in caches.
 *
 * On loopback hosts (dev server, e2e) the vendored copy is the only candidate:
 * deterministic local runs beat saving local bandwidth.
 */
import type { PyodideInterface } from "pyodide";
import pyodidePkg from "pyodide/package.json";

type PyodideModule = {
  loadPyodide: (options: { indexURL: string }) => Promise<PyodideInterface>;
};

export const PYODIDE_VERSION: string = pyodidePkg.version;

/**
 * npm mirrors that carry the exact pinned release, verified to serve the
 * whole runtime end-to-end. npmmirror's CDN (Alibaba) is the most reliable
 * reach from domestic school networks; jsDelivr is pyodide's documented CDN
 * and the only one serving brotli (~6 MB wire vs ~13 MB), but historically
 * unreliable in the mainland; unpkg is the overseas wildcard.
 *
 * Note: npmmirror's registry `…/files/` endpoint is deliberately avoided —
 * it answers HTTP 451 for python_stdlib.zip. The `cdn.npmmirror.com
 * /packages/` host serves every file correctly.
 */
const CDN_BASES = [
  `https://cdn.npmmirror.com/packages/pyodide/${PYODIDE_VERSION}/files/`,
  `https://cdn.jsdelivr.net/npm/pyodide@${PYODIDE_VERSION}/`,
  `https://unpkg.com/pyodide@${PYODIDE_VERSION}/`,
];

/** Stall budget per mirror before moving on to the next source. */
const CDN_TIMEOUT_MS = 8_000;

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

/** Runtime base URLs to try, in order; the vendored copy is always last. */
export function pyodideBaseCandidates(baseUrl: string, hostname: string): string[] {
  const vendored = `${baseUrl}vendor/pyodide-${PYODIDE_VERSION}/`;
  return isLoopbackHost(hostname) ? [vendored] : [...CDN_BASES, vendored];
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`pyodide source timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function loadFrom(base: string): Promise<PyodideInterface> {
  const mod = (await import(/* @vite-ignore */ `${base}pyodide.mjs`)) as PyodideModule;
  return mod.loadPyodide({ indexURL: base });
}

let pyodideReady: Promise<PyodideInterface> | null = null;

export function getPyodide(): Promise<PyodideInterface> {
  if (!pyodideReady) {
    const bases = pyodideBaseCandidates(import.meta.env.BASE_URL, location.hostname);
    pyodideReady = (async () => {
      let lastError: unknown;
      for (const [index, base] of bases.entries()) {
        const attempt = loadFrom(base);
        void attempt.catch(() => undefined);
        try {
          // The vendored fallback is the last resort — let it run unbounded;
          // the caller's own load budget is what bounds the wait.
          return await (index === bases.length - 1
            ? attempt
            : withTimeout(attempt, CDN_TIMEOUT_MS));
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    })();
    pyodideReady.catch(() => {
      // Let the next request retry a failed runtime load.
      pyodideReady = null;
    });
  }
  return pyodideReady;
}
