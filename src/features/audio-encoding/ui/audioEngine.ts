/**
 * Browser-side audio plumbing: decoding, microphone recording, playback.
 *
 * Everything here converts at the edge — in and out of the engine the lab
 * speaks `PcmAudio`, the domain's plain channel-array shape. Audio never
 * leaves the browser; there is no upload anywhere in this lab.
 */

import { MAX_AUDIO_SECONDS, type PcmAudio } from "../domain/audio.ts";

let ctx: AudioContext | null = null;

/** Shared AudioContext, created lazily and resumed on every use. */
export function sharedAudioContext(): AudioContext {
  if (!ctx) {
    const Ctor =
      typeof AudioContext !== "undefined"
        ? AudioContext
        : (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("这个浏览器不支持 Web Audio——换用较新的 Chrome/Firefox/Edge 试试。");
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Decoded AudioBuffer → domain shape. Multi-channel (>2) folds down to stereo. */
function bufferToPcm(buffer: AudioBuffer): PcmAudio {
  const count = buffer.numberOfChannels;
  const channels: Float32Array[] = [];
  if (count <= 2) {
    for (let i = 0; i < count; i += 1) channels.push(buffer.getChannelData(i).slice());
  } else {
    // Fold >2 channels into stereo by alternating index — no channel is
    // silently dropped, odd/even groups are averaged.
    const left = new Float32Array(buffer.length);
    const right = new Float32Array(buffer.length);
    const weight = 2 / count;
    for (let i = 0; i < count; i += 1) {
      const src = buffer.getChannelData(i);
      const dst = i % 2 === 0 ? left : right;
      for (let n = 0; n < src.length; n += 1) dst[n] += src[n] * weight;
    }
    channels.push(left, right);
  }
  return { sampleRate: buffer.sampleRate, channels };
}

/** Decode a user-picked file. Errors are student-readable and actionable. */
export async function decodeFileToPcm(file: File): Promise<PcmAudio> {
  if (file.size === 0) {
    throw new Error("这个文件是空的——换一个音频文件试试。");
  }
  let buffer: AudioBuffer;
  try {
    const data = await file.arrayBuffer();
    buffer = await sharedAudioContext().decodeAudioData(data);
  } catch {
    throw new Error(
      "浏览器解码不了这个格式。常见 mp3 / wav / ogg / m4a 一般都可以——换一个文件，或先转成 wav 再导入。",
    );
  }
  if (buffer.duration > MAX_AUDIO_SECONDS) {
    throw new Error(
      `这段音频约 ${Math.round(buffer.duration)} 秒，超过 ${MAX_AUDIO_SECONDS} 秒上限——请截取更短的一段再导入（长音频会占大量内存、让界面变卡）。`,
    );
  }
  if (buffer.duration < 0.05 || buffer.length === 0) {
    throw new Error("这段音频太短（不足 50ms），没有可分析的内容。");
  }
  return bufferToPcm(buffer);
}

export type MicRecorder = {
  /** Stop and decode what was captured; releases the microphone either way. */
  stop: () => Promise<PcmAudio>;
  /** Abort without producing audio; releases the microphone. */
  cancel: () => void;
};

const MAX_RECORD_SECONDS = 15;

/**
 * Arm microphone recording. The stream's tracks are always stopped when
 * recording ends — success, cancel, or error — so the mic indicator never
 * stays lit. The recorder auto-stops at MAX_RECORD_SECONDS.
 */
export async function startMicRecording(): Promise<MicRecorder> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    const name = (error as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new Error("麦克风权限被拒绝——在浏览器地址栏的站点设置里允许麦克风后重试。");
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      throw new Error("没有找到可用的麦克风设备。");
    }
    throw new Error("启动麦克风失败了——检查系统录音权限和设备占用。");
  }

  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const release = () => {
    for (const track of stream.getTracks()) track.stop();
  };

  let done: ((pcm: PcmAudio) => void) | null = null;
  let failed: ((err: Error) => void) | null = null;
  let settled = false;
  let cancelled = false;

  const finish = () =>
    new Promise<PcmAudio>((resolve, reject) => {
      done = resolve;
      failed = reject;
      if (recorder.state !== "inactive") recorder.stop();
      else if (chunks.length) recorder.onstop?.(new Event("stop"));
    });

  recorder.onstop = () => {
    if (settled) return;
    settled = true;
    release();
    if (cancelled) return;
    const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    void (async () => {
      try {
        const pcm = await decodeFileToPcm(new File([blob], "录音.webm", { type: blob.type }));
        done?.(pcm);
      } catch (error) {
        failed?.(error instanceof Error ? error : new Error("录音解码失败。"));
      }
    })();
  };
  recorder.onerror = () => {
    if (settled) return;
    settled = true;
    release();
    failed?.(new Error("录音过程出错了。"));
  };

  recorder.start(250);
  const autoStop = window.setTimeout(() => {
    if (recorder.state !== "inactive") recorder.stop();
  }, MAX_RECORD_SECONDS * 1000);

  return {
    stop: () => {
      window.clearTimeout(autoStop);
      return finish();
    },
    cancel: () => {
      window.clearTimeout(autoStop);
      cancelled = true;
      settled = true;
      if (recorder.state !== "inactive") recorder.stop();
      release();
    },
  };
}

/** Wrap a PcmAudio in an AudioBuffer for playback. */
export function pcmToBuffer(pcm: PcmAudio): AudioBuffer {
  const context = sharedAudioContext();
  const length = Math.max(1, pcm.channels[0]?.length ?? 0);
  const buffer = context.createBuffer(pcm.channels.length, length, pcm.sampleRate);
  pcm.channels.forEach((data, i) => buffer.copyToChannel(data as Float32Array<ArrayBuffer>, i));
  return buffer;
}
