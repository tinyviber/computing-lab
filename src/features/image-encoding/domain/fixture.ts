/** Canonical seed colors expanded into the 8×8 source image as 2×2 blocks. */
export const SOURCE_COLORS = [
  "#2E6F95",
  "#6EA5C4",
  "#D9A441",
  "#A9C7D6",
  "#4C9FBE",
  "#8AC1D1",
  "#E4B84A",
  "#D47B42",
  "#A8D5BA",
  "#4C9FBE",
  "#17212B",
  "#F0C36A",
  "#7C9EB2",
  "#DCE7EF",
  "#E4B84A",
  "#4C9FBE",
] as const;

export const SOURCE_WIDTH = 8;
export const SOURCE_HEIGHT = 8;

export const SOURCE_PIXELS = Array.from({ length: SOURCE_WIDTH * SOURCE_HEIGHT }, (_, index) => {
  const row = Math.floor(index / SOURCE_WIDTH);
  const column = index % SOURCE_WIDTH;
  const sourceRow = Math.floor(row / 2);
  const sourceColumn = Math.floor(column / 2);
  return SOURCE_COLORS[sourceRow * 4 + sourceColumn];
});
