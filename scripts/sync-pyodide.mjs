// Copies the pinned Pyodide runtime files into public/vendor/pyodide so the
// app can serve them same-origin without a CDN. Runs on postinstall; safe to
// run manually: `node scripts/sync-pyodide.mjs`.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = join(root, "node_modules", "pyodide");
const dest = join(root, "public", "vendor", "pyodide");

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

mkdirSync(dest, { recursive: true });
for (const file of FILES) {
  copyFileSync(join(src, file), join(dest, file));
}
console.log(`[sync-pyodide] copied ${FILES.length} files -> public/vendor/pyodide`);
