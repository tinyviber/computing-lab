import { useEffect, useRef } from "react";
import type { RasterImage } from "../domain/model";

type RasterCanvasProps = {
  raster: RasterImage;
  label: string;
  className?: string;
};

export function RasterCanvas({ raster, label, className = "" }: RasterCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let context: CanvasRenderingContext2D | null;
    try {
      context = canvas.getContext("2d");
    } catch {
      return;
    }
    if (!context) return;
    canvas.width = raster.width;
    canvas.height = raster.height;
    const image = context.createImageData(raster.width, raster.height);
    raster.pixels.forEach((pixel, index) => {
      const offset = index * 4;
      image.data[offset] = pixel.r;
      image.data[offset + 1] = pixel.g;
      image.data[offset + 2] = pixel.b;
      image.data[offset + 3] = 255;
    });
    context.putImageData(image, 0, 0);
  }, [raster]);

  return (
    <canvas
      aria-label={label}
      className={`image-raster ${className}`.trim()}
      height={raster.height}
      ref={ref}
      role="img"
      width={raster.width}
    />
  );
}
