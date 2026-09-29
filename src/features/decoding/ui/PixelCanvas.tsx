/**
 * Pixel-faithful canvas renderer for an RGB PixelMatrix — the decoded-image
 * preview. Same convention as the image-sampling BitmapCanvas: nearest-pixel
 * scaling, thin grid between cells when zoomed far enough.
 */

import { useEffect, useRef } from "react";
import type { PixelMatrix } from "../domain/bmp.ts";

export function PixelCanvas({
  pixels,
  pixelSize,
  grid = true,
  ariaLabel,
}: {
  pixels: PixelMatrix;
  /** CSS px per cell; default scales the image into a ~200px box. */
  pixelSize?: number;
  grid?: boolean;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const height = pixels.length;
  const width = pixels[0]?.length ?? 0;
  const px = pixelSize ?? Math.max(4, Math.round(200 / Math.max(width, height)));

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = width * px;
    canvas.height = height * px;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const [r, g, b] = pixels[y][x];
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(x * px, y * px, px, px);
      }
    }
    if (grid && px >= 6) {
      ctx.strokeStyle = "rgba(90, 108, 128, 0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < width; x += 1) {
        ctx.moveTo(x * px + 0.5, 0);
        ctx.lineTo(x * px + 0.5, canvas.height);
      }
      for (let y = 1; y < height; y += 1) {
        ctx.moveTo(0, y * px + 0.5);
        ctx.lineTo(canvas.width, y * px + 0.5);
      }
      ctx.stroke();
    }
  }, [pixels, px, grid, width, height]);

  return (
    <canvas
      aria-label={ariaLabel}
      className="pixel-canvas"
      ref={ref}
      role="img"
      style={{ imageRendering: "pixelated" }}
    />
  );
}
