// Copies the pinned Pyodide runtime files into public/vendor/pyodide-<version>
// so the app can serve them same-origin as the CDN fallback. The versioned
// path makes the files safe to cache immutably, and .br/.gz siblings let the
// static server answer with precompressed responses. Runs on postinstall;
// safe to run manually: `node scripts/sync-pyodide.mjs`.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = join(root, "node_modules", "pyodide");

const FILES = [
  "pyodide.mjs",
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
];

if (!existsSync(join(src, "pyodide.mjs"))) {
  console.warn("[sync-pyodide] node_modules/pyodide not found; skipping (install first)");
  process.exit(0);
}

const version = JSON.parse(readFileSync(join(src, "package.json"), "utf8")).version;
const vendorDir = join(root, "public", "vendor");
const dest = join(vendorDir, `pyodide-${version}`);

// Drop stale runtime copies so old versions don't linger after an upgrade.
mkdirSync(vendorDir, { recursive: true });
for (const entry of readdirSync(vendorDir)) {
  if (entry.startsWith("pyodide") && entry !== `pyodide-${version}`) {
    rmSync(join(vendorDir, entry), { recursive: true, force: true });
  }
}

mkdirSync(dest, { recursive: true });
for (const file of FILES) {
  copyFileSync(join(src, file), join(dest, file));
}
// Brotli quality 8: q11 squeezes ~12% more out of the 9.6 MB wasm but takes
// ~30x longer — not worth slowing every install down for.
for (const file of FILES) {
  const data = readFileSync(join(dest, file));
  writeFileSync(
    join(dest, `${file}.br`),
    brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 8 } }),
  );
  writeFileSync(join(dest, `${file}.gz`), gzipSync(data, { level: 9 }));
}
console.log(
  `[sync-pyodide] copied ${FILES.length} files (+ .br/.gz) -> public/vendor/pyodide-${version}`,
);
