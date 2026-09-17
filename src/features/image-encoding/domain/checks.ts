import { FIXTURE_TARGET_REGIONS } from "./fixture.ts";
import {
  countPixelDiffs,
  cropRegion,
  deriveImageEncodingModel,
  encodingSignature,
  patchRegion,
  regionError,
  type RasterImage,
} from "./model.ts";
import { hotspotHits, type RestorationCase } from "./restoration.ts";
import {
  artifactOptions,
  artifactRawBits,
  budgetBits,
  DEFAULT_BUDGET_RATIO,
  type Artifact,
} from "./stops.ts";

export type CheckResult = { passed: boolean; detail: string };

export const CORE2_REGION_ERROR_MAX = 0.12;

export const CORE3_MIN_DIFF_PIXELS = 8;

export function checkCore1(input: { studentBits: string; expectedBits: string }): CheckResult {
  const student = input.studentBits.trim();
  if (student === input.expectedBits) {
    return { passed: true, detail: "这一行的编码和系统一致：你已经按约定表把像素编成了 bit。" };
  }
  const length = Math.min(student.length, input.expectedBits.length);
  for (let index = 0; index < length; index += 1) {
    if (student[index] !== input.expectedBits[index]) {
      return {
        passed: false,
        detail: `第 ${index + 1} 位不一样：你写的是 ${student[index]}，按约定表应是 ${input.expectedBits[index]}。`,
      };
    }
  }
  return {
    passed: false,
    detail:
      student.length < input.expectedBits.length
        ? `还差 ${input.expectedBits.length - student.length} 位：一行 ${Math.floor(input.expectedBits.length / 2)} 个像素，每个像素 2 bit。`
        : "长度对不上：这一行应该是 16 bit。",
  };
}

export function checkCore2(input: {
  source: RasterImage;
  artifact: Artifact;
  budgetRatio?: number;
}): CheckResult {
  const bits = artifactRawBits(input.source, input.artifact);
  const budget = budgetBits(input.source, input.budgetRatio ?? DEFAULT_BUDGET_RATIO);
  if (bits > budget) {
    return {
      passed: false,
      detail: `超出预算：需要 ${bits} bit，预算只有 ${budget} bit。降低分辨率档或颜色档再试。`,
    };
  }
  const model = deriveImageEncodingModel(input.source, artifactOptions(input.artifact));
  const target = FIXTURE_TARGET_REGIONS[input.artifact.image];
  const error = regionError(model, target);
  if (error > CORE2_REGION_ERROR_MAX) {
    return {
      passed: false,
      detail: `在预算内（${bits} ≤ ${budget} bit），但目标区域的平均颜色误差 ${(error * 100).toFixed(1)}% 超过 ${(CORE2_REGION_ERROR_MAX * 100).toFixed(0)}% 的上限。`,
    };
  }
  return {
    passed: true,
    detail: `在预算内，目标区域平均颜色误差 ${(error * 100).toFixed(1)}%（≤ ${(CORE2_REGION_ERROR_MAX * 100).toFixed(0)}%）。这就是你的“老照片”——它和原图还差多少，由你自己判断。`,
  };
}

export function checkCore3(input: {
  source: RasterImage;
  artifact: Artifact;
  original: RasterImage;
  edited: RasterImage;
}): CheckResult {
  const diffs = countPixelDiffs(input.original, input.edited);
  if (diffs === 0) {
    return { passed: false, detail: "还没有改动：试着涂几个像素，看看编码会不会变。" };
  }
  const options = artifactOptions(input.artifact);
  const { region } = core3Window(input.source, input.artifact);
  const patched = patchRegion(input.source, region, input.edited);
  const originalSignature = encodingSignature(
    deriveImageEncodingModel(input.source, options).quantized,
  );
  const editedSignature = encodingSignature(deriveImageEncodingModel(patched, options).quantized);
  if (originalSignature !== editedSignature) {
    return {
      passed: false,
      detail:
        "编码变了：你改到了被保留的像素（或落进别的颜色格的像素）。找一找哪些像素根本不会被采样到。",
    };
  }
  if (diffs < CORE3_MIN_DIFF_PIXELS) {
    return {
      passed: false,
      detail: `方向对了，编码没变——再大胆一点：至少改 ${CORE3_MIN_DIFF_PIXELS} 个像素，现在改了 ${diffs} 个。`,
    };
  }
  return {
    passed: true,
    detail: `改了 ${diffs} 个像素，编码完全相同。这些像素在编码里根本不存在——任何解码器都找不回它们。`,
  };
}

export function checkChallenge2(input: {
  restorationCase: RestorationCase;
  clicks: readonly { x: number; y: number }[];
}): CheckResult {
  const hits = hotspotHits(input.clicks, input.restorationCase.hotspots);
  const needed = input.restorationCase.requiredHits;
  if (hits >= needed) {
    return {
      passed: true,
      detail: `找到了 ${hits} 处“修错”的细节：它们在输入里没有证据，是模型按先验“想象”出来的。`,
    };
  }
  return {
    passed: false,
    detail:
      hits === 0
        ? "还没有点中。对照原图和输入：哪些细节清晰得“不像能推出来的”？"
        : `已找到 ${hits} 处，还需要 ${needed - hits} 处。`,
  };
}

export const CORE3_WINDOW_SIZE = 16;

export function core3Window(
  source: RasterImage,
  artifact: Artifact,
): { original: RasterImage; region: { x: number; y: number; width: number; height: number } } {
  const target = FIXTURE_TARGET_REGIONS[artifact.image];
  const side = Math.min(CORE3_WINDOW_SIZE, source.width, source.height);
  const region = {
    x: Math.max(
      0,
      Math.min(source.width - side, target.x + Math.floor(target.width / 2 - side / 2)),
    ),
    y: Math.max(
      0,
      Math.min(source.height - side, target.y + Math.floor(target.height / 2 - side / 2)),
    ),
    width: side,
    height: side,
  };
  return { original: cropRegion(source, region), region };
}
