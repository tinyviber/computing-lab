import { describe, expect, it } from "vitest";
import { getImageFixture } from "../../src/features/image-encoding/domain/fixture";
import { deriveImageEncodingModel } from "../../src/features/image-encoding/domain/model";
import { artifactOptions } from "../../src/features/image-encoding/domain/stops";
import { quantizedPpm } from "./generate-inputs";

describe("restoration input generation", () => {
  it("encodes the exact quantized grid as a binary PPM", () => {
    const model = deriveImageEncodingModel(
      getImageFixture("pixel-grid"),
      artifactOptions({ image: "pixel-grid", resStop: 50, colorStop: "palette4" }),
    );
    const ppm = quantizedPpm(model.quantized);
    const marker = new TextEncoder().encode("255\n");
    const markerIndex = ppm.findIndex((value, index) =>
      marker.every((part, offset) => ppm[index + offset] === part),
    );
    const bodyOffset = markerIndex + marker.length;

    expect(new TextDecoder().decode(ppm.slice(0, bodyOffset))).toBe("P6\n8 8\n255\n");
    expect(ppm).toHaveLength(bodyOffset + model.quantized.pixels.length * 3);
    expect([...ppm.slice(bodyOffset, bodyOffset + 3)]).toEqual([
      model.quantized.pixels[0].quantizedColor.r,
      model.quantized.pixels[0].quantizedColor.g,
      model.quantized.pixels[0].quantizedColor.b,
    ]);
  });
});
