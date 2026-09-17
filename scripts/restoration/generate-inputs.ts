import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  getImageFixture,
  type ImageFixtureId,
} from "../../src/features/image-encoding/domain/fixture";
import { checkCore2 } from "../../src/features/image-encoding/domain/checks";
import { type QuantizedRepresentation } from "../../src/features/image-encoding/domain/model";
import {
  artifactOptions,
  budgetCombos,
  type Artifact,
} from "../../src/features/image-encoding/domain/stops";
import { deriveImageEncodingModel } from "../../src/features/image-encoding/domain/model";
import { restorationAssetPath } from "../../src/features/image-encoding/domain/restoration";

export type RestorationInputEntry = {
  artifact: Artifact;
  input: string;
  output: string;
  inputWidth: number;
  inputHeight: number;
  outputWidth: number;
  outputHeight: number;
  pipeline: "real-esrgan" | "real-esrgan+ddcolor";
};

export type RestorationInputManifest = {
  version: 1;
  entries: RestorationInputEntry[];
};

export function quantizedPpm(representation: QuantizedRepresentation): Uint8Array {
  const header = new TextEncoder().encode(
    `P6\n${representation.width} ${representation.height}\n255\n`,
  );
  const body = new Uint8Array(representation.pixels.length * 3);
  representation.pixels.forEach((pixel, index) => {
    body[index * 3] = pixel.quantizedColor.r;
    body[index * 3 + 1] = pixel.quantizedColor.g;
    body[index * 3 + 2] = pixel.quantizedColor.b;
  });
  const ppm = new Uint8Array(header.length + body.length);
  ppm.set(header);
  ppm.set(body, header.length);
  return ppm;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fixturesFromArgument(value: string | undefined): ImageFixtureId[] {
  const values = (value ?? "photo").split(",").filter(Boolean);
  const legal = new Set<ImageFixtureId>([
    "photo",
    "gradient",
    "checkerboard",
    "text-edge",
    "pixel-grid",
  ]);
  const fixtures = values.filter((value): value is ImageFixtureId =>
    legal.has(value as ImageFixtureId),
  );
  if (fixtures.length !== values.length || fixtures.length === 0) {
    throw new Error(`Invalid --fixtures value: ${value ?? ""}`);
  }
  return fixtures;
}

function runFfmpeg(ppm: Uint8Array, output: string): void {
  const result = spawnSync(
    process.env.FFMPEG ?? "ffmpeg",
    [
      "-loglevel",
      "error",
      "-f",
      "image2pipe",
      "-vcodec",
      "ppm",
      "-i",
      "pipe:0",
      "-frames:v",
      "1",
      "-y",
      output,
    ],
    { input: ppm },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(result.stderr.toString() || `ffmpeg exited ${result.status}`);
}

async function generate(outputRoot: string, fixtureIds: ImageFixtureId[]): Promise<void> {
  const inputRoot = resolve(outputRoot, "inputs");
  await mkdir(inputRoot, { recursive: true });
  const entries: RestorationInputEntry[] = [];

  for (const fixtureId of fixtureIds) {
    const source = getImageFixture(fixtureId);
    for (const artifact of budgetCombos(source)) {
      if (!checkCore2({ source, artifact }).passed) continue;
      const model = deriveImageEncodingModel(source, artifactOptions(artifact));
      const filename = `${artifact.image}-${artifact.resStop}-${artifact.colorStop}.png`;
      const output = resolve(inputRoot, filename);
      runFfmpeg(quantizedPpm(model.quantized), output);
      entries.push({
        artifact,
        input: `inputs/${filename}`,
        output: restorationAssetPath(artifact.image, artifact.resStop, artifact.colorStop),
        inputWidth: model.quantized.width,
        inputHeight: model.quantized.height,
        outputWidth: source.width,
        outputHeight: source.height,
        pipeline: artifact.colorStop === "gray8" ? "real-esrgan+ddcolor" : "real-esrgan",
      });
    }
  }

  const manifest: RestorationInputManifest = { version: 1, entries };
  await writeFile(resolve(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Generated ${entries.length} restoration inputs at ${outputRoot}\n`);
}

if (import.meta.main) {
  const output = argument("--output");
  if (!output)
    throw new Error(
      "Usage: bun scripts/restoration/generate-inputs.ts --output <directory> [--fixtures photo]",
    );
  await generate(resolve(output), fixturesFromArgument(argument("--fixtures")));
}
