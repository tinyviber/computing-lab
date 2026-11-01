// Manages the pinned BGE embedding model the AI-intake stage runs in the
// browser. The model files are COMMITTED under
// public/vendor/models/Xenova/bge-small-zh-v1.5/ so a clean `git archive`
// build (deploy reconcile, CI) always ships them — nothing here runs at
// install or build time.
//
//   bun run sync:embed          verify every committed file against the
//                               sha256 manifest in embed-manifest.mjs;
//                               no network needed.
//   bun run sync:embed --force  re-download every file at PINNED_REVISION
//                               and then verify. Use this to vendor a new
//                               upstream cut: bump PINNED_REVISION, run,
//                               then update the SHA256 table.
//
// Downloads prefer hf-mirror.com (reachable from domestic school
// networks) and fall back to huggingface.co; curl honors
// HTTPS_PROXY/https_proxy. The ONNX Runtime wasm is NOT vendored — the
// worker imports it from node_modules as hashed build assets.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { MODEL_ID, PINNED_REVISION, SHA256 } from "./embed-manifest.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const HOSTS = ["https://hf-mirror.com", "https://huggingface.co"];
const modelDest = join(root, "public", "vendor", "models", MODEL_ID);
const FILES = Object.keys(SHA256);

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fetchFile(host, file, dest) {
  const url = `${host}/${MODEL_ID}/resolve/${PINNED_REVISION}/${file}`;
  const result = spawnSync("curl", ["-fLsS", "--retry", "2", "-m", "300", "-o", dest, url], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  return result.status === 0;
}

if (process.argv.includes("--force")) {
  mkdirSync(join(modelDest, "onnx"), { recursive: true });
  let failures = 0;
  for (const file of FILES) {
    const dest = join(modelDest, file);
    const host = HOSTS.find((candidate) => fetchFile(candidate, file, dest));
    if (!host) {
      failures++;
      rmSync(dest, { force: true });
      console.error(`[sync-embed] FAILED ${file} on every host`);
    } else {
      console.log(`[sync-embed] ${file} <- ${host}@${PINNED_REVISION.slice(0, 8)}`);
    }
  }
  if (failures > 0) {
    console.error(`[sync-embed] ${failures} model file(s) failed to download`);
    process.exit(1);
  }
}

let bad = 0;
for (const file of FILES) {
  const dest = join(modelDest, file);
  if (!existsSync(dest)) {
    bad++;
    console.error(`[sync-embed] MISSING ${file} — run \`bun run sync:embed --force\``);
    continue;
  }
  const digest = sha256File(dest);
  if (digest !== SHA256[file]) {
    bad++;
    console.error(`[sync-embed] CHECKSUM MISMATCH ${file}: ${digest}`);
  }
}
if (bad > 0) {
  console.error(`[sync-embed] ${bad}/${FILES.length} files missing or corrupted`);
  process.exit(1);
}
console.log(
  `[sync-embed] ${MODEL_ID}@${PINNED_REVISION.slice(0, 8)} verified (${FILES.length} files)`,
);
