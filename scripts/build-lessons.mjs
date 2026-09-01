import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(new URL("..", import.meta.url).pathname);
const lessonsRoot = resolve(root, "lessons");
const slidevCli = resolve(root, "node_modules/@slidev/cli/bin/slidev.mjs");

function normalizeBase(value) {
  const raw = value?.trim() || "/";
  if (raw === "/") return "/";
  return `/${raw.replace(/^\/+|\/+$/g, "")}/`;
}

function publicBase(slug) {
  return `${normalizeBase(process.env.VITE_BASE_PATH)}slides/${slug}/`;
}

if (!existsSync(lessonsRoot)) {
  console.log("Slidev: no lessons directory, skipping");
  process.exit(0);
}

if (!existsSync(slidevCli)) {
  throw new Error(`Slidev CLI is missing: ${slidevCli}`);
}

const lessons = readdirSync(lessonsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(entry.name))
  .map((entry) => entry.name)
  .filter((slug) => existsSync(resolve(lessonsRoot, slug, "slides.md")));

for (const slug of lessons) {
  const lessonRoot = resolve(lessonsRoot, slug);
  const output = resolve(root, "dist/slides", slug);
  const args = [slidevCli, "build", "slides.md", "--out", output, "--base", publicBase(slug)];

  console.log(`Slidev: building ${slug} at ${publicBase(slug)}`);
  const result = spawnSync(process.execPath, args, {
    cwd: lessonRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Slidev failed for ${slug} with exit code ${result.status}`);
  }
}

console.log(`Slidev: built ${lessons.length} lesson${lessons.length === 1 ? "" : "s"}`);
