import { useEffect, useRef } from "react";
import type { PcmAudio } from "../domain/audio.ts";
import { durationOf } from "../domain/audio.ts";

/**
 * Min/max bucketed waveform: one vertical slice per pixel column, so even
 * a 60-second clip draws in one pass without copying big arrays. Channels
 * stack vertically; amplitude is always the shared [-1, 1] range and the
 * x-axis spans `spanSeconds` (the caller passes the same value to every
 * canvas in a comparison, so time axes line up).
 */
export function WaveformCanvas(props: {
  audio: PcmAudio;
  /** Timeline width in seconds — pass the max duration across compared clips. */
  spanSeconds?: number;
  color: string;
  baselineColor?: string;
  height?: number;
  label: string;
}) {
  const { audio, spanSeconds, color, baselineColor = "#dbe3ee", height = 84, label } = props;
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth * dpr;
      const h = height * dpr;
      if (w <= 0) return;
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext("2d");
      if (!g) return;
      g.clearRect(0, 0, w, h);
      const span = Math.max(spanSeconds ?? 0, durationOf(audio), 1e-6);
      const rows = audio.channels.length;
      const rowH = h / rows;
      audio.channels.forEach((data, ch) => {
        const y0 = rowH * ch;
        g.strokeStyle = baselineColor;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(0, y0 + rowH / 2);
        g.lineTo(w, y0 + rowH / 2);
        g.stroke();
        const frames = data.length;
        const spanFrames = span * audio.sampleRate;
        const scaleY = rowH / 2 - 2;
        g.fillStyle = color;
        for (let x = 0; x < w; x += 1) {
          const f0 = Math.floor((x / w) * spanFrames);
          const f1 = Math.max(f0 + 1, Math.ceil(((x + 1) / w) * spanFrames));
          if (f0 >= frames) break;
          let mn = 1;
          let mx = -1;
          for (let i = f0; i < f1 && i < frames; i += 1) {
            const v = data[i];
            if (v < mn) mn = v;
            if (v > mx) mx = v;
          }
          if (mn > mx) continue;
          const yTop = y0 + rowH / 2 - mx * scaleY;
          const yBot = y0 + rowH / 2 - mn * scaleY;
          g.fillRect(x, yTop, 1, Math.max(1, yBot - yTop));
        }
      });
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [audio, spanSeconds, color, baselineColor, height]);

  return <canvas aria-label={label} className="ae-wave" ref={ref} role="img" style={{ height }} />;
}
