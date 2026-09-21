/**
 * Binary bitmap primitives for the image-sampling lab.
 *
 * A BinaryImage is a row-major 0/1 grid — 1 means "ink", 0 means "empty".
 * Everything here is integer math so results are identical in the browser
 * preview and in the Node judge.
 */

export type BinaryImage = {
  width: number;
  height: number;
  /** Row-major 0/1 cells, length = width * height. */
  cells: Uint8Array;
};

export function makeImage(width: number, height: number): BinaryImage {
  return { width, height, cells: new Uint8Array(width * height) };
}

export function cloneImage(image: BinaryImage): BinaryImage {
  return { width: image.width, height: image.height, cells: image.cells.slice() };
}

export function getCell(image: BinaryImage, x: number, y: number): 0 | 1 {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return 0;
  return (image.cells[y * image.width + x] ? 1 : 0) as 0 | 1;
}

export function setCell(image: BinaryImage, x: number, y: number, value: 0 | 1): void {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  image.cells[y * image.width + x] = value;
}

/** Fill the rectangle [x0,x1) × [y0,y1), clipped to the image. */
export function fillRect(
  image: BinaryImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  value: 0 | 1 = 1,
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
  image: BinaryImage,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  value: 0 | 1 = 1,
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

export function inkCount(image: BinaryImage): number {
  let n = 0;
  for (const v of image.cells) n += v;
  return n;
}

export function imagesEqual(a: BinaryImage, b: BinaryImage): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.cells.length; i += 1) {
    if (a.cells[i] !== b.cells[i]) return false;
  }
  return true;
}

/** Human-readable rows ("1010…") — handy in tests and fixtures. */
export function imageToRows(image: BinaryImage): string[] {
  const rows: string[] = [];
  for (let y = 0; y < image.height; y += 1) {
    let row = "";
    for (let x = 0; x < image.width; x += 1) {
      row += image.cells[y * image.width + x] ? "1" : "0";
    }
    rows.push(row);
  }
  return rows;
}

export function imageFromRows(rows: string[]): BinaryImage {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const image = makeImage(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      image.cells[y * width + x] = rows[y][x] === "1" ? 1 : 0;
    }
  }
  return image;
}

/**
 * Pack cells as base64 for transport in judge payloads (one bit per cell,
 * MSB first). Deterministic and compact: 64×64 → 512 bytes → 684 chars.
 */
export function imageToBase64(image: BinaryImage): string {
  const bytes = new Uint8Array(Math.ceil(image.cells.length / 8));
  for (let i = 0; i < image.cells.length; i += 1) {
    if (image.cells[i]) bytes[i >> 3] |= 0x80 >> (i & 7);
  }
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function imageFromBase64(width: number, height: number, encoded: string): BinaryImage {
  const binary = atob(encoded);
  const image = makeImage(width, height);
  for (let i = 0; i < image.cells.length; i += 1) {
    const byte = binary.charCodeAt(i >> 3);
    image.cells[i] = (byte >> (7 - (i & 7))) & 1;
  }
  return image;
}
