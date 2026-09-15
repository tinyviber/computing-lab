import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const lessonsRoot = resolve(root, "lessons");

if (!existsSync(lessonsRoot)) {
  console.log("PPTX: no lessons directory, skipping");
  process.exit(0);
}

const lessons = readdirSync(lessonsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(entry.name))
  .map((entry) => entry.name)
  .filter((slug) => existsSync(resolve(lessonsRoot, slug, "lesson.pptx")));

mkdirSync(resolve(root, "dist/slides"), { recursive: true });

for (const slug of lessons) {
  const source = resolve(lessonsRoot, slug, "lesson.pptx");
  const output = resolve(root, "dist/slides", `${slug}.pptx`);
  copyFileSync(source, output);
  console.log(`PPTX: copied ${slug} to dist/slides/${slug}.pptx`);
}

console.log(`PPTX: built ${lessons.length} lesson${lessons.length === 1 ? "" : "s"}`);
