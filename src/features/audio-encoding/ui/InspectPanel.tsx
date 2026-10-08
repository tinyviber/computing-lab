import { useEffect, useMemo, useRef, useState } from "react";
import type { PcmAudio } from "../domain/audio.ts";
import { durationOf } from "../domain/audio.ts";
import { foldedHz, topPeaks } from "../domain/fft.ts";
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

/**
 * 频谱混叠视图：原音的主要频率分量（灰）与处理后的实测分量（紫）。
 * 高于目标奈奎斯特的分量画折回箭头——"多出来的音"从听见变成看见。
 */
function SpectrumView({ original, processed, targetRate }: ViewProps) {
  const srcPeaks = useMemo(
    () => topPeaks(original.channels[0] ?? new Float32Array(0), original.sampleRate, 10),
    [original],
  );
  const outPeaks = useMemo(
    () =>
      processed
        ? topPeaks(processed.channels[0] ?? new Float32Array(0), processed.sampleRate, 10)
        : [],
    [processed],
  );
  const srcNyq = original.sampleRate / 2;
  const dstNyq = targetRate / 2;
  const fmax = Math.min(srcNyq, Math.max(dstNyq * 1.5, ...srcPeaks.map((p) => p.freq)) * 1.1);
  const height = 170;

  const ref = useCanvas(
    (g, w, h) => {
      const x = (f: number) => (f / fmax) * (w - 30) + 6;
      const y = (m: number) => h - 22 - m * (h - 46);
      // Axis + Hz ticks
      g.strokeStyle = COLORS.grid;
      g.fillStyle = COLORS.text;
      g.font = "10.5px system-ui";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, h - 22);
      g.lineTo(w, h - 22);
      g.stroke();
      const tick = fmax > 30000 ? 10000 : fmax > 12000 ? 4000 : 2000;
      for (let f = 0; f <= fmax; f += tick) {
        g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x(f) - 6, h - 8);
      }
      // Target-Nyquist line — the wall partials bounce off.
      g.strokeStyle = COLORS.stem;
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(x(dstNyq), 4);
      g.lineTo(x(dstNyq), h - 22);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = COLORS.stem;
      g.fillText(
        `奈奎斯特 ${dstNyq >= 1000 ? `${(dstNyq / 1000).toFixed(1)}k` : dstNyq}Hz`,
        Math.min(x(dstNyq) + 4, w - 100),
        12,
      );
      // Fold-back arrows for original peaks above the target Nyquist.
      for (const p of srcPeaks) {
        if (p.freq > dstNyq) {
          const folded = foldedHz(p.freq, targetRate);
          g.strokeStyle = "#d97706";
          g.fillStyle = "#d97706";
          g.lineWidth = 1.4;
          g.beginPath();
          g.moveTo(x(p.freq), y(p.magnitude) - 4);
          g.quadraticCurveTo(x(p.freq), 8, x(folded), 10);
          g.lineTo(x(folded), 18);
          g.stroke();
          // Arrowhead
          g.beginPath();
          g.moveTo(x(folded), 22);
          g.lineTo(x(folded) - 3.5, 14);
          g.lineTo(x(folded) + 3.5, 14);
          g.closePath();
          g.fill();
        }
      }
      // Stems: original peaks (gray) and measured processed peaks (purple).
      for (const p of srcPeaks) {
        g.strokeStyle = COLORS.original;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x(p.freq) - 3, h - 22);
        g.lineTo(x(p.freq) - 3, y(p.magnitude));
        g.stroke();
        g.fillStyle = COLORS.original;
        g.fillText(`${Math.round(p.freq)}`, x(p.freq) - 12, y(p.magnitude) - 4);
      }
      for (const p of outPeaks) {
        g.strokeStyle = COLORS.processed;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x(p.freq) + 3, h - 22);
        g.lineTo(x(p.freq) + 3, y(p.magnitude));
        g.stroke();
        g.fillStyle = COLORS.processed;
        g.fillText(`${Math.round(p.freq)}`, x(p.freq) - 8, y(p.magnitude) - 4);
      }
      if (!processed) {
        g.fillStyle = COLORS.text;
        g.font = "12px system-ui";
        g.fillText("改任意参数，紫色谱峰会显示处理后实测到的分量。", 8, 30);
      }
    },
    height,
    [srcPeaks, outPeaks, dstNyq, fmax, targetRate, processed],
  );

  return (
    <div>
      <canvas className="ae-inspect-canvas" ref={ref} style={{ height }} />
      <p className="ae-view-note">
        灰线 = 原音主要分量，紫线 = 处理后实测分量，红虚线 =
        目标采样率的奈奎斯特上限。橙箭头：越界分量被折回低频——这就是混叠，信号多出了原本没有的频率。
      </p>
    </div>
  );
}

export function InspectPanel(props: ViewProps) {
  const [view, setView] = useState<"points" | "stairs" | "spectrum">("points");
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
          <button
            aria-pressed={view === "spectrum"}
            className={view === "spectrum" ? "is-active" : ""}
            onClick={() => setView("spectrum")}
            type="button"
          >
            频谱混叠
          </button>
        </div>
      </div>
      {view === "points" ? (
        <SamplePointsView {...props} />
      ) : view === "stairs" ? (
        <StaircaseView {...props} />
      ) : (
        <SpectrumView {...props} />
      )}
    </section>
  );
}
