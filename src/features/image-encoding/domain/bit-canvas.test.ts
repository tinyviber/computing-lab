import { describe, expect, it } from "vitest";
import {
  BIT_CANVAS_CELLS,
  BIT_CANVAS_EDIT_ROW,
  BIT_CANVAS_SIZE,
  BIT_CANVAS_TABLES,
  decodeBits,
  encodeCells,
  encodeRow,
} from "./bit-canvas";

describe("bit canvas (Core 1)", () => {
  it("is an 8×8 grid of 2-bit symbols", () => {
    expect(BIT_CANVAS_CELLS).toHaveLength(BIT_CANVAS_SIZE * BIT_CANVAS_SIZE);
    for (const cell of BIT_CANVAS_CELLS) {
      expect(cell).toBeGreaterThanOrEqual(0);
      expect(cell).toBeLessThanOrEqual(3);
    }
    expect(encodeCells(BIT_CANVAS_CELLS)).toHaveLength(64 * 2);
  });

  it("encodes the student row as 16 bits", () => {
    expect(encodeRow(BIT_CANVAS_CELLS, BIT_CANVAS_EDIT_ROW)).toBe("0111010101011001");
  });

  it("decodes the same bits differently under a different convention", () => {
    const bits = encodeRow(BIT_CANVAS_CELLS, BIT_CANVAS_EDIT_ROW);
    const asGray = decodeBits(bits, BIT_CANVAS_TABLES.gray);
    const asColor = decodeBits(bits, BIT_CANVAS_TABLES.color);
    expect(asGray).toHaveLength(BIT_CANVAS_SIZE);
    expect(asGray[0]).toEqual(BIT_CANVAS_TABLES.gray.colors[1]);
    expect(asColor[0]).toEqual(BIT_CANVAS_TABLES.color.colors[1]);
    expect(asGray[0]).not.toEqual(asColor[0]);
    expect(asGray[1]).toEqual(BIT_CANVAS_TABLES.gray.colors[3]);
    expect(asColor[1]).toEqual(BIT_CANVAS_TABLES.color.colors[3]);
  });

  it("ignores trailing incomplete pairs and clamps out-of-range input", () => {
    expect(decodeBits("011", BIT_CANVAS_TABLES.gray)).toHaveLength(1);
    expect(decodeBits("1101", BIT_CANVAS_TABLES.gray)).toHaveLength(2);
  });
});
