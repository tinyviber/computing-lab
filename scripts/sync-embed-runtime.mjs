// Vendors everything the AI-intake PoC worker needs into public/vendor so
// the classroom never touches an outside network:
//
//   1. ONNX Runtime's asyncify wasm build (the pair transformers.js
//      itself fetches from jsDelivr — carries both wasm and WebGPU EPs)
//      → public/vendor/onnxruntime-web-<ver>/ — straight from node_modules.
//   2. The pinned BGE embedding model (config + tokenizer + q8 weights)
//      → public/vendor/models/Xenova/bge-small-zh-v1.5/ — downloaded via
//      curl, hf-mirror.com first because it is the reachable host from
//      domestic school networks; huggingface.co is the fallback. curl
//      honors HTTPS_PROXY/https_proxy for machines behind a proxy.
//
// Both dirs get .br/.gz sidecars like scripts/sync-pyodide.mjs so the
// static server can answer precompressed, and both are gitignored —
// run this once per machine: `bun run sync:embed`.
import { spawnSync } from "node:child_process";
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
const vendorDir = join(root, "public", "vendor");

function compressAll(dir) {
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || entry.name.endsWith(".br") || entry.name.endsWith(".gz")) continue;
    const path = join(entry.parentPath, entry.name);
    const data = readFileSync(path);
    writeFileSync(
      `${path}.br`,
      brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 8 } }),
    );
    writeFileSync(`${path}.gz`, gzipSync(data, { level: 9 }));
  }
}

/* ---- 1. ONNX Runtime wasm ------------------------------------------------ */

const ortSrc = join(root, "node_modules", "onnxruntime-web", "dist");
const ortPkg = join(root, "node_modules", "onnxruntime-web", "package.json");
const ORT_FILES = ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"];

if (!existsSync(ortPkg)) {
  console.warn("[sync-embed] node_modules/onnxruntime-web not found; skipping (install first)");
} else {
  const ortVersion = JSON.parse(readFileSync(ortPkg, "utf8")).version;
  const dest = join(vendorDir, `onnxruntime-web-${ortVersion}`);
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(vendorDir)) {
    if (entry.startsWith("onnxruntime-web") && entry !== `onnxruntime-web-${ortVersion}`) {
      rmSync(join(vendorDir, entry), { recursive: true, force: true });
    }
  }
  for (const file of ORT_FILES) {
    copyFileSync(join(ortSrc, file), join(dest, file));
  }
  compressAll(dest);
  console.log(`[sync-embed] onnxruntime-web ${ortVersion} asyncify wasm -> ${dest}`);
}

/* ---- 2. BGE model files --------------------------------------------------- */

const MODEL_ID = "Xenova/bge-small-zh-v1.5";
const MODEL_FILES = [
  "config.json",
  "quantize_config.json",
  "special_tokens_map.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "vocab.txt",
  "onnx/model_quantized.onnx",
];
const HOSTS = ["https://hf-mirror.com", "https://huggingface.co"];
const modelDest = join(vendorDir, "models", MODEL_ID);

function fetchFile(host, file, dest) {
  const url = `${host}/${MODEL_ID}/resolve/main/${file}`;
  const result = spawnSync("curl", ["-fLsS", "--retry", "2", "-m", "300", "-o", dest, url], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  return result.status === 0;
}

mkdirSync(join(modelDest, "onnx"), { recursive: true });
let failures = 0;
for (const file of MODEL_FILES) {
  const dest = join(modelDest, file);
  if (existsSync(dest)) continue; // idempotent — re-run only fills gaps
  const host = HOSTS.find((candidate) => fetchFile(candidate, file, dest));
  if (!host) {
    failures++;
    rmSync(dest, { force: true });
    console.error(`[sync-embed] FAILED ${file} on every host`);
  } else {
    console.log(`[sync-embed] ${file} <- ${host}`);
  }
}
if (failures > 0) {
  console.error(
    `[sync-embed] ${failures} model file(s) failed — the PoC page will not load the model`,
  );
  process.exit(1);
}
compressAll(modelDest);
console.log(`[sync-embed] model ${MODEL_ID} -> ${modelDest}`);
