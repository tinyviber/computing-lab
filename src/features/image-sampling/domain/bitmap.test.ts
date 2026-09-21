import { describe, expect, it } from "vitest";
import {
  fillRect,
  imageFromBase64,
  imageFromRows,
  imageToBase64,
  imageToRows,
  imagesEqual,
  inkCount,
  makeImage,
  setCell,
} from "./bitmap.ts";

describe("bitmap primitives", () => {
  it("imageFromRows / imageToRows round-trip", () => {
    const rows = ["1010", "0101", "1111", "0000"];
    const image = imageFromRows(rows);
    expect(image.width).toBe(4);
    expect(image.height).toBe(4);
    expect(imageToRows(image)).toEqual(rows);
    expect(inkCount(image)).toBe(8);
  });

  it("fillRect fills a clipped half-open rectangle", () => {
    const image = makeImage(4, 4);
    fillRect(image, -2, 1, 3, 3);
    expect(imageToRows(image)).toEqual(["0000", "1110", "1110", "0000"]);
  });

  it("setCell/getCell bounds-check silently", () => {
    const image = makeImage(2, 2);
    setCell(image, 5, 5, 1);
    expect(inkCount(image)).toBe(0);
  });

  it("base64 pack/unpack round-trips arbitrary sizes", () => {
    const image = imageFromRows(["101", "011", "100", "001", "110"]);
    const packed = imageToBase64(image);
    const restored = imageFromBase64(image.width, image.height, packed);
    expect(imagesEqual(image, restored)).toBe(true);
  });

  it("imagesEqual requires same dimensions", () => {
    const a = imageFromRows(["11"]);
    const b = imageFromRows(["1", "1"]);
    expect(imagesEqual(a, b)).toBe(false);
  });
});
