import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../shared/auth";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { ScenarioLinkButton } from "../../../shared/lab/ScenarioLinkButton";
import {
  DEFAULT_PARAMS,
  MAX_BIT_DEPTH,
  MAX_SAMPLE_RATE,
  MIN_BIT_DEPTH,
  MIN_SAMPLE_RATE,
  type AudioParams,
} from "../domain/audio.ts";
import { demoSignalById } from "../domain/signals.ts";
import { AudioWorkbench } from "./AudioWorkbench.tsx";
import "./audioEncoding.css";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** ?rate=&bits=&ch=&sig= → initial params (per-field, clamped). */
function paramsFromSearch(search: Record<string, unknown>): AudioParams {
  const num = (k: string) => {
    const raw = search[k];
    const v = typeof raw === "string" || typeof raw === "number" ? Number(raw) : NaN;
    return Number.isFinite(v) ? v : null;
  };
  const params = { ...DEFAULT_PARAMS };
  const rate = num("rate");
  if (rate != null) params.sampleRate = Math.round(clamp(rate, MIN_SAMPLE_RATE, MAX_SAMPLE_RATE));
  const bits = num("bits");
  if (bits != null) params.bitDepth = Math.round(clamp(bits, MIN_BIT_DEPTH, MAX_BIT_DEPTH));
  const ch = num("ch");
  if (ch === 1 || ch === 2) params.channels = ch;
  return params;
}

function encodeSearch(params: AudioParams, signalId: string): Record<string, string | number> {
  const out: Record<string, string | number> = {
    rate: params.sampleRate,
    bits: params.bitDepth,
    ch: params.channels,
  };
  if (signalId) out.sig = signalId;
  return out;
}

/**
 * 「声音编码」demo page — NOT a judged lab: no stages, drafts or
 * submissions. A single tool page a teacher can project or students can
 * poke at: pick material → turn rate/depth/channel knobs → watch the
 * waveforms, sample points, staircase and alias spectrum change live.
 * Built for classrooms without headphones: the story is told in pictures.
 */
export function AudioEncodingDemoPage() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const [params, setParams] = useState<AudioParams>(() => paramsFromSearch(search));
  const [signalId, setSignalId] = useState<string>(() =>
    typeof search.sig === "string" ? demoSignalById(search.sig).id : "",
  );

  // Demo pages require a login like everything else — send anonymous
  // visitors to /login rather than gating them mid-session.
  useEffect(() => {
    if (status === "anonymous") void navigate({ to: "/login" });
  }, [status, navigate]);

  const onParams = useMemo(
    () => (patch: Partial<AudioParams>) => {
      setParams((prev) => {
        const next = { ...prev, ...patch };
        next.sampleRate = Math.round(clamp(next.sampleRate, MIN_SAMPLE_RATE, MAX_SAMPLE_RATE));
        next.bitDepth = Math.round(clamp(next.bitDepth, MIN_BIT_DEPTH, MAX_BIT_DEPTH));
        next.channels = next.channels === 1 ? 1 : 2;
        return next;
      });
    },
    [],
  );

  if (status !== "authenticated") {
    return (
      <AppPageLayout topbarProps={{ subtitle: "音频数字化演示", title: "声音编码" }}>
        <p className="home-loading" role="status">
          正在进入演示…
        </p>
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout
      className="audio-encoding-demo"
      topbarProps={{
        subtitle: "采样 · 量化 · 数据量，全程浏览器本地运行",
        title: "声音编码（演示）",
      }}
    >
      <main aria-label="声音编码演示" className="ae-workspace">
        <section className="stage-brief">
          <p className="stage-mission">
            一段连续声波是怎么变成一串数字的？调右边的参数，看采样点、量化阶梯和频谱怎么跟着变。
          </p>
          <p>
            三步走：① 选一个素材（内置信号或导入音频）② 调采样率 / 位深 / 声道 ③
            对比波形、放大看采样点与量化阶梯、在频谱图里找混叠。所有处理都在本机浏览器内完成。
          </p>
        </section>
        <AudioWorkbench
          initialSignalId={signalId}
          onParams={onParams}
          onSignalId={(id) => setSignalId(id ?? "")}
          params={params}
        />
        <div className="ae-demo-footer">
          <ScenarioLinkButton search={encodeSearch(params, signalId)} />
          <p className="ae-hint">
            把当前参数组合复制成链接发给学生；打开链接会直接载入同样的配置。信号选择：
            <select
              aria-label="选择演示信号"
              className="ae-sig-select"
              onChange={(e) => setSignalId(e.target.value)}
              value={signalId}
            >
              <option value="">（默认）</option>
              <option value="voice">语音样例</option>
              <option value="music">音乐样例</option>
              <option value="highs">高频泛音样例</option>
            </select>
          </p>
        </div>
      </main>
    </AppPageLayout>
  );
}
