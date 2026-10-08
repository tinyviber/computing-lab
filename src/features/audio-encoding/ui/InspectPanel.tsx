import { useEffect, useRef, useState } from "react";
import type { PcmAudio } from "../domain/audio.ts";
import { durationOf } from "../domain/audio.ts";
import { resampleChannel } from "../domain/resample.ts";

const COLORS = {
  original: "#526579",
  processed: "#4f46e5",
  grid: "#dbe3ee",
  stem: "#b42318",
  text: "#5f6e81",
};

type ViewProps = {
  original: PcmAudio;
  processed: PcmAudio | null;
  targetRate: number;
  bitDepth: number;
};

function useCanvas(
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  height: number,
  deps: unknown[],
) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth * dpr;
      const h = height * dpr;
      if (w <= 0) return;
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext("2d");
      if (!g) return;
      g.clearRect(0, 0, w, h);
      g.save();
      g.scale(dpr, dpr);
      draw(g, canvas.clientWidth, height);
      g.restore();
    };
    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, deps);
  return ref;
}

/** A windowed slice of channel 0 for the zoom views. */
function windowSlice(
  audio: PcmAudio,
  t0: number,
  windowSec: number,
): { data: Float32Array; start: number } {
  const src = audio.channels[0] ?? new Float32Array(0);
  const start = Math.max(0, Math.min(src.length - 1, Math.round(t0 * audio.sampleRate)));
  const end = Math.min(src.length, Math.round((t0 + windowSec) * audio.sampleRate));
  return { data: src.slice(start, end), start };
}

const drawCurve = (
  g: CanvasRenderingContext2D,
  data: Float32Array,
  w: number,
  h: number,
  color: string,
  staircase = false,
) => {
  if (data.length === 0) return;
  g.strokeStyle = color;
  g.lineWidth = 1.6;
  g.beginPath();
  const y = (v: number) => h / 2 - (v * h) / 2.2;
  const x = (i: number) => (i / Math.max(1, data.length - 1)) * w;
  if (staircase) {
    // Hold each level until the next sample — the "阶梯" of quantization.
    g.moveTo(0, y(data[0]));
    for (let i = 1; i < data.length; i += 1) {
      g.lineTo(x(i), y(data[i - 1]));
      g.lineTo(x(i), y(data[i]));
    }
  } else {
    g.moveTo(0, y(data[0]));
    for (let i = 1; i < data.length; i += 1) g.lineTo(x(i), y(data[i]));
  }
  g.stroke();
};

function TimeSlider(props: { t0: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="ae-zoom-slider">
      观察窗口
      <input
        aria-label="移动观察窗口"
        max={Math.max(0, props.max)}
        min={0}
        onChange={(e) => props.onChange(Number(e.target.value))}
        step={props.max / 200 || 0.01}
        type="range"
        value={props.t0}
      />
      <span>{props.t0.toFixed(2)} s</span>
    </label>
  );
}

/** 采样点视图：连续波形 + 目标采样率下的离散采样点。 */
function SamplePointsView({ original, processed, targetRate }: ViewProps) {
  const duration = durationOf(original);
  const windowSec = Math.min(0.02, Math.max(0.005, duration / 4));
  const [t0, setT0] = useState(0);
  const maxT0 = Math.max(0, duration - windowSec);
  const t = Math.min(t0, maxT0);

  const ref = useCanvas(
    (g, w, h) => {
      const { data, start } = windowSlice(original, t, windowSec);
      drawCurve(g, data, w, h, COLORS.original);
      // The sample dots are the REAL resampled values for this window — the
      // same windowed-sinc algorithm the pipeline uses, not an eyeball pick.
      const samples = resampleChannel(data, original.sampleRate, targetRate);
      g.strokeStyle = COLORS.stem;
      g.fillStyle = COLORS.stem;
      for (let i = 0; i < samples.length; i += 1) {
        const x = ((start / original.sampleRate + i / targetRate - t) / windowSec) * w;
        if (x < 0 || x > w) continue;
        const y = h / 2 - (samples[i] * h) / 2.2;
        g.beginPath();
        g.moveTo(x, h / 2);
        g.lineTo(x, y);
        g.lineWidth = 0.8;
        g.stroke();
        g.beginPath();
        g.arc(x, y, 3, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = COLORS.text;
      g.font = "11px system-ui";
      g.fillText(`${samples.length} 个采样点 / ${(windowSec * 1000).toFixed(0)} ms`, 8, 14);
    },
    150,
    [original, processed, targetRate, t, windowSec],
  );

  return (
    <div>
      <canvas className="ae-inspect-canvas" ref={ref} style={{ height: 150 }} />
      <TimeSlider max={maxT0} onChange={setT0} t0={t} />
      <p className="ae-view-note">
        灰线是原波形，红点是 {targetRate} Hz
        下真正采到的值。采样率一低，点就开始跟不上波形的变化——那就是混叠的来源。
      </p>
    </div>
  );
}

/** 量化阶梯视图：处理前后局部对比 + 位深等级网格。 */
function StaircaseView({ original, processed, targetRate, bitDepth }: ViewProps) {
  const duration = durationOf(original);
  const windowSec = Math.min(0.02, Math.max(0.005, duration / 4));
  const [t0, setT0] = useState(0);
  const maxT0 = Math.max(0, duration - windowSec);
  const t = Math.min(t0, maxT0);

  const ref = useCanvas(
    (g, w, h) => {
      // Level grid: for ≤64 levels draw every step; denser depths get a coarser subgrid.
      const levels = 2 ** bitDepth;
      const step = levels <= 64 ? 2 / levels : 1 / 16;
      g.strokeStyle = COLORS.grid;
      g.lineWidth = 0.6;
      for (let v = -1; v <= 1.0001; v += step) {
        const y = h / 2 - (v * h) / 2.2;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      const { data } = windowSlice(original, t, windowSec);
      drawCurve(g, data, w, h, COLORS.original);
      if (processed) {
        const { data: proc } = windowSlice(processed, t, windowSec);
        drawCurve(g, proc, w, h, COLORS.processed, true);
      }
      g.fillStyle = COLORS.text;
      g.font = "11px system-ui";
      g.fillText(`${levels} 级 / ${bitDepth} bit`, 8, 14);
    },
    150,
    [original, processed, targetRate, bitDepth, t, windowSec],
  );

  return (
    <div>
      <canvas className="ae-inspect-canvas" ref={ref} style={{ height: 150 }} />
      <TimeSlider max={maxT0} onChange={setT0} t0={t} />
      <p className="ae-view-note">
        {processed
          ? `紫线是量化后的波形——每个值只能停在 ${2 ** bitDepth} 条网格线之一上，所以走出「台阶」。位深越低台阶越粗。`
          : "先「开始数字化」，这里会显示原波形 vs 量化阶梯。"}
      </p>
    </div>
  );
}

export function InspectPanel(props: ViewProps) {
  const [view, setView] = useState<"points" | "stairs">("points");
  return (
    <section className="ae-panel" aria-label="放大观察">
      <div className="ae-panel-heading">
        <h3>放大看：连续 → 离散</h3>
        <div className="ae-seg" role="tablist">
          <button
            aria-pressed={view === "points"}
            className={view === "points" ? "is-active" : ""}
            onClick={() => setView("points")}
            type="button"
          >
            采样点
          </button>
          <button
            aria-pressed={view === "stairs"}
            className={view === "stairs" ? "is-active" : ""}
            onClick={() => setView("stairs")}
            type="button"
          >
            量化阶梯
          </button>
        </div>
      </div>
      {view === "points" ? <SamplePointsView {...props} /> : <StaircaseView {...props} />}
    </section>
  );
}
