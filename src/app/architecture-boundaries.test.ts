import { readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = join(srcRoot, "app");
const featuresRoot = join(srcRoot, "features");
const sharedRoot = join(srcRoot, "shared");
const sourceExtensions = new Set([".ts", ".tsx"]);

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf("."))) &&
      !entry.name.includes(".test.") &&
      !entry.name.includes(".spec.")
      ? [path]
      : [];
  });
}

function isWithin(path: string, root: string): boolean {
  const child = relative(root, path);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

function importedPaths(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(/(?:from\s+|import\s*(?:\(\s*)?)["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
}

function resolveImport(file: string, specifier: string): string | null {
  if (specifier.startsWith(".")) return resolve(dirname(file), specifier);
  if (specifier.startsWith("@/")) return resolve(srcRoot, specifier.slice(2));
  return null;
}

function violations(root: string, check: (specifier: string, resolved: string | null) => boolean) {
  return sourceFiles(root).flatMap((file) =>
    importedPaths(file)
      .filter((specifier) => check(specifier, resolveImport(file, specifier)))
      .map((specifier) => `${relative(srcRoot, file)} -> ${specifier}`),
  );
}

describe("architecture boundaries", () => {
  it("keeps shared infrastructure independent of app and features", () => {
    expect(
      violations(sharedRoot, (_specifier, resolved) => {
        return (
          resolved !== null && (isWithin(resolved, appRoot) || isWithin(resolved, featuresRoot))
        );
      }),
    ).toEqual([]);
  });

  it("keeps feature domain logic independent of React and UI", () => {
    const domainFiles = sourceFiles(featuresRoot).filter((file) => {
      const parts = relative(featuresRoot, file).split(sep);
      return parts[1] === "domain";
    });
    const violationsFound = domainFiles.flatMap((file) =>
      importedPaths(file)
        .filter((specifier) => {
          const resolved = resolveImport(file, specifier);
          return (
            /^react(?:-|\/|$)/.test(specifier) ||
            (resolved !== null && /(?:^|[/\\])ui(?:[/\\]|$)/.test(resolved))
          );
        })
        .map((specifier) => `${relative(srcRoot, file)} -> ${specifier}`),
    );
    expect(violationsFound).toEqual([]);
  });
});
