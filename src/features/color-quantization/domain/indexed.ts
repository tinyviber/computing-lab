/**
 * Palette-indexed bitmap primitives for the color-quantization lab.
 *
 * An IndexedImage is a row-major grid of small integers. In source artwork,
 * cell 0 means paper and 1..14 index into SOURCE_COLORS; in printed output,
 * cell 0 means paper and 1..8 index into TONER_RACK. Everything is integer
 * math so results are identical in the browser preview and the Node judge.
 */

export type IndexedImage = {
  width: number;
  height: number;
  /** Row-major palette indices, length = width * height. */
  cells: Uint8Array;
};

export function makeImage(width: number, height: number): IndexedImage {
  return { width, height, cells: new Uint8Array(width * height) };
}

export function cloneImage(image: IndexedImage): IndexedImage {
  return { width: image.width, height: image.height, cells: image.cells.slice() };
}

export function getCell(image: IndexedImage, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return 0;
  return image.cells[y * image.width + x];
}

export function setCell(image: IndexedImage, x: number, y: number, value: number): void {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  image.cells[y * image.width + x] = value;
}

/** Fill the rectangle [x0,x1) × [y0,y1), clipped to the image. */
export function fillRect(
  image: IndexedImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  value: number,
): void {
  const xa = Math.max(0, Math.min(image.width, x0));
  const xb = Math.max(0, Math.min(image.width, x1));
  const ya = Math.max(0, Math.min(image.height, y0));
  const yb = Math.max(0, Math.min(image.height, y1));
  for (let y = ya; y < yb; y += 1) {
    for (let x = xa; x < xb; x += 1) {
      image.cells[y * image.width + x] = value;
    }
  }
}

/** Axis-aligned ellipse via integer midpoint test — used for rounded bodies. */
export function fillEllipse(
  image: IndexedImage,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  value: number,
): void {
  if (rx <= 0 || ry <= 0) return;
  for (let y = Math.max(0, cy - ry); y <= Math.min(image.height - 1, cy + ry); y += 1) {
    for (let x = Math.max(0, cx - rx); x <= Math.min(image.width - 1, cx + rx); x += 1) {
      const dx = (x - cx) * ry;
      const dy = (y - cy) * rx;
      if (dx * dx + dy * dy <= rx * rx * ry * ry) {
        image.cells[y * image.width + x] = value;
      }
    }
  }
}

export function imagesEqual(a: IndexedImage, b: IndexedImage): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.cells.length; i += 1) {
    if (a.cells[i] !== b.cells[i]) return false;
  }
  return true;
}

/** Row-major index grid as plain nested lists — the shape student Python sees. */
export function imageToLists(image: IndexedImage): number[][] {
  const rows: number[][] = [];
  for (let y = 0; y < image.height; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < image.width; x += 1) {
      row.push(image.cells[y * image.width + x]);
    }
    rows.push(row);
  }
  return rows;
}

export function imageFromLists(rows: number[][]): IndexedImage {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const image = makeImage(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      image.cells[y * width + x] = rows[y][x];
    }
  }
  return image;
}

/** Exact identity signature — two prints are indistinguishable iff equal. */
export function imageSignature(image: IndexedImage): string {
  return image.cells.join(",");
}

/**
 * Pack cells as base64 for transport in judge payloads (one byte per cell —
 * palette indices never exceed 255). 64×64 → 4096 bytes → ~5.5k chars.
 */
export function imageToBase64(image: IndexedImage): string {
  let binary = "";
  for (const b of image.cells) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function imageFromBase64(width: number, height: number, encoded: string): IndexedImage {
  const binary = atob(encoded);
  const image = makeImage(width, height);
  for (let i = 0; i < image.cells.length && i < binary.length; i += 1) {
    image.cells[i] = binary.charCodeAt(i);
  }
  return image;
}
