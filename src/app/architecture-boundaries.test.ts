import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, relative } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = join(process.cwd(), "src");
const sourceExtensions = [".ts", ".tsx", ".js", ".jsx"];
type SourceScope = "app" | "features" | "shared" | "design" | "test" | "other";
type FeatureLayer = "domain" | "lesson" | "ui";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    if (!sourceExtensions.includes(extname(file))) return [];
    if (file.includes(".test.") || file.endsWith("/setup.ts")) return [];
    return [file];
  });
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(/(?:from|import\s*\()\s*["']([^"']+)["']/g)].map(
    ([, specifier]) => specifier,
  );
}

function resolveLocalImport(file: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = normalize(join(dirname(file), specifier));
  const candidates = [base, ...sourceExtensions.map((extension) => `${base}${extension}`)];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  for (const extension of sourceExtensions) {
    const indexFile = join(base, `index${extension}`);
    if (existsSync(indexFile)) return indexFile;
  }
  return undefined;
}

export function sourceScopeOf(file: string): SourceScope {
  const parts = relative(srcRoot, file).split("/");
  if (["app", "features", "shared", "design", "test"].includes(parts[0])) {
    return parts[0] as SourceScope;
  }
  return "other";
}

export function featureLayerOf(file: string): FeatureLayer | undefined {
  const parts = relative(srcRoot, file).split("/");
  if (parts[0] !== "features") return undefined;
  return ["domain", "lesson", "ui"].includes(parts[2]) ? (parts[2] as FeatureLayer) : undefined;
}

function featureOf(file: string): string | undefined {
  const parts = relative(srcRoot, file).split("/");
  return parts[0] === "features" ? parts[1] : undefined;
}

function isFeaturePublicEntry(file: string): boolean {
  const parts = relative(srcRoot, file).split("/");
  return parts[0] === "features" && parts.length === 3 && parts[2] === "index.ts";
}

export function boundaryViolations(
  sourceFile: string,
  targetFile: string,
  targetSpecifier?: string,
): string[] {
  const sourceScope = sourceScopeOf(sourceFile);
  const targetScope = sourceScopeOf(targetFile);
  const sourceFeature = featureOf(sourceFile);
  const targetFeature = featureOf(targetFile);
  const sourceLayer = featureLayerOf(sourceFile);
  const targetLayer = featureLayerOf(targetFile);
  const result: string[] = [];
  const targetDescription = targetLayer ?? targetScope;

  if (
    sourceLayer === "domain" &&
    targetSpecifier &&
    /^(react|react-dom|@tanstack\/react-router)$/.test(targetSpecifier)
  ) {
    result.push("domain cannot use UI framework");
  }
  if (
    sourceLayer === "domain" &&
    (["app", "shared"].includes(targetScope) || ["lesson", "ui"].includes(targetLayer ?? ""))
  ) {
    result.push(`domain cannot import ${targetDescription}`);
  }
  if (
    sourceLayer === "lesson" &&
    targetSpecifier &&
    /^(react|react-dom|@tanstack\/react-router)$/.test(targetSpecifier)
  ) {
    result.push("lesson cannot use UI framework");
  }
  if (
    sourceLayer === "lesson" &&
    (["app", "shared"].includes(targetScope) || targetLayer === "ui")
  ) {
    result.push(`lesson cannot import ${targetDescription}`);
  }
  if (sourceScope === "shared" && targetScope === "features") {
    result.push("shared cannot import features");
  }
  if (sourceScope === "app" && targetScope === "features" && !isFeaturePublicEntry(targetFile)) {
    result.push("app must use feature public entrypoint");
  }
  if (sourceFeature && targetFeature && sourceFeature !== targetFeature) {
    result.push("cross-feature import");
  }
  if (sourceLayer === "ui" && targetScope === "app") {
    result.push("feature UI cannot import app");
  }
  return result;
}

function violations(file: string): string[] {
  const result: string[] = [];
  const sourceLayer = featureLayerOf(file);

  for (const specifier of importsOf(file)) {
    const resolved = resolveLocalImport(file, specifier);
    if (resolved) {
      result.push(
        ...boundaryViolations(file, resolved, specifier).map(
          (violation) => `${specifier}: ${violation}`,
        ),
      );
    } else if (
      sourceLayer === "domain" &&
      /^(react|react-dom|@tanstack\/react-router)$/.test(specifier)
    ) {
      result.push(`${specifier}: domain cannot use UI framework`);
    } else if (
      sourceLayer === "lesson" &&
      /^(react|react-dom|@tanstack\/react-router)$/.test(specifier)
    ) {
      result.push(`${specifier}: lesson cannot use UI framework`);
    }
  }
  return result;
}

describe("architecture boundaries", () => {
  it("keeps dependency direction explicit", () => {
    const failures = sourceFiles(srcRoot).flatMap((file) =>
      violations(file).map((failure) => `${relative(srcRoot, file)} → ${failure}`),
    );
    expect(failures).toEqual([]);
  });

  it("rejects app deep-imports and shared feature imports", () => {
    const appFile = join(srcRoot, "app/router.tsx");
    const sharedFile = join(srcRoot, "shared/lab/LabShell.tsx");
    const featureUi = join(srcRoot, "features/image-encoding/ui/ImageEncodingPage.tsx");
    const featureDomain = join(srcRoot, "features/image-encoding/domain/model.ts");
    const appEntry = join(srcRoot, "features/image-encoding/index.ts");

    expect(boundaryViolations(appFile, featureUi)).toContain(
      "app must use feature public entrypoint",
    );
    expect(boundaryViolations(appFile, appEntry)).toEqual([]);
    expect(boundaryViolations(sharedFile, featureDomain)).toContain(
      "shared cannot import features",
    );
  });

  it("rejects cross-feature imports independently of feature layer", () => {
    const imageUi = join(srcRoot, "features/image-encoding/ui/ImageEncodingPage.tsx");
    const audioDomain = join(srcRoot, "features/audio-encoding/domain/model.ts");

    expect(boundaryViolations(imageUi, audioDomain)).toContain("cross-feature import");
  });

  it("keeps Sound independent of the legacy shared lesson primitives", () => {
    const soundUiFile = join(srcRoot, "features/audio-encoding/ui/AudioEncodingPage.tsx");
    const soundStateFile = join(srcRoot, "features/audio-encoding/lesson/state.ts");
    const soundModelFile = join(srcRoot, "features/audio-encoding/domain/model.ts");
    const soundUi = readFileSync(soundUiFile, "utf8");
    const soundState = readFileSync(soundStateFile, "utf8");
    const soundModel = readFileSync(soundModelFile, "utf8");

    for (const primitive of [
      "ExperimentStatus",
      "ExperimentPhase",
      "FormulaPanel",
      "ParameterControl",
      "VisualizationPanel",
    ]) {
      expect(soundUi, `Sound UI must not import ${primitive}`).not.toMatch(
        new RegExp(`import[^;\\n]*\\b${primitive}\\b`),
      );
    }
    expect(soundState).not.toMatch(/(?:AudioPhase|SoundPhase)/);
    expect(soundUi).not.toMatch(/(?:AudioPhase|SoundPhase)/);
    expect(soundState).not.toMatch(/(?:Date|performance|requestAnimationFrame|AudioContext)/);
    expect(soundModel).not.toMatch(/(?:Date|performance|requestAnimationFrame|AudioContext)/);
  });

  it("keeps Image independent of the legacy shared lesson primitives", () => {
    const imageUiFile = join(srcRoot, "features/image-encoding/ui/ImageEncodingPage.tsx");
    const imageStateFile = join(srcRoot, "features/image-encoding/lesson/state.ts");
    const imageDomainFile = join(srcRoot, "features/image-encoding/domain/model.ts");
    const imageUi = readFileSync(imageUiFile, "utf8");
    const imageState = readFileSync(imageStateFile, "utf8");
    const imageDomain = readFileSync(imageDomainFile, "utf8");

    for (const primitive of [
      "ExperimentStatus",
      "ExperimentPhase",
      "FormulaPanel",
      "ParameterControl",
      "VisualizationPanel",
    ]) {
      expect(imageUi, `Image UI must not import ${primitive}`).not.toMatch(
        new RegExp(`import[^;\\n]*\\b${primitive}\\b`),
      );
    }
    expect(imageState).not.toMatch(/(?:ImagePhase|submit|retry|next-step)/);
    expect(imageDomain).not.toMatch(/(?:React|Canvas|ImageData|document|window)/);
  });

  it("gives LabShell only chrome and children ownership", () => {
    const shellFile = join(srcRoot, "shared/lab/LabShell.tsx");
    const shell = readFileSync(shellFile, "utf8");

    expect(shell).toMatch(/children\??:\s*ReactNode/);
    expect(shell).toMatch(/<main[\s\S]*children/);
    for (const legacyProp of [
      "controlsLabel",
      "navigation?: ReactNode",
      "visualization?: ReactNode",
      "controls?: ReactNode",
      "explanation?: ReactNode",
      "actions?: ReactNode",
      "hasSlots",
      "lab-shell-workspace",
    ]) {
      expect(shell, `LabShell still owns legacy slot ${legacyProp}`).not.toContain(legacyProp);
    }
  });
});
