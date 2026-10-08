import { useCallback, useEffect, useRef, useState } from "react";
import type { PcmAudio } from "../domain/audio.ts";
import { durationOf } from "../domain/audio.ts";
import { pcmToBuffer, sharedAudioContext } from "./audioEngine.ts";

export type PlayerSource = "original" | "processed";

/**
 * Original/processed playback with an honest A/B switch: swapping sources
 * mid-play restarts the other clip at the same timeline offset, so the
 * two versions can be compared at the same point. Stop is stop — there is
 * no fake "pause".
 */
export function useAudioPlayer() {
  const [playing, setPlaying] = useState<PlayerSource | null>(null);
  const nodeRef = useRef<AudioBufferSourceNode | null>(null);
  const stateRef = useRef<{
    source: PlayerSource;
    startedAt: number;
    offset: number;
    dur: number;
  } | null>(null);
  const pcmRef = useRef<Partial<Record<PlayerSource, PcmAudio | null>>>({});

  const stopNow = useCallback(() => {
    try {
      nodeRef.current?.stop();
    } catch {
      /* already stopped */
    }
    nodeRef.current = null;
    stateRef.current = null;
    setPlaying(null);
  }, []);

  const playAt = useCallback((source: PlayerSource, offset: number) => {
    const pcm = pcmRef.current[source];
    if (!pcm || pcm.channels.length === 0) return;
    const context = sharedAudioContext();
    const buffer = pcmToBuffer(pcm);
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);
    const dur = durationOf(pcm);
    const startAt = offset % Math.max(dur, 1e-6);
    node.start(0, startAt);
    node.onended = () => {
      if (nodeRef.current === node) {
        nodeRef.current = null;
        stateRef.current = null;
        setPlaying(null);
      }
    };
    nodeRef.current = node;
    stateRef.current = { source, startedAt: context.currentTime, offset: startAt, dur };
    setPlaying(source);
  }, []);

  const play = useCallback(
    (source: PlayerSource) => {
      stopNow();
      playAt(source, 0);
    },
    [playAt, stopNow],
  );

  /** A/B: switch source keeping the current position. */
  const swapTo = useCallback(
    (source: PlayerSource) => {
      const cur = stateRef.current;
      if (!cur || cur.source === source) {
        play(source);
        return;
      }
      const context = sharedAudioContext();
      const pos = (context.currentTime - cur.startedAt + cur.offset) % Math.max(cur.dur, 1e-6);
      stopNow();
      playAt(source, pos);
    },
    [play, playAt, stopNow],
  );

  const setSource = useCallback(
    (source: PlayerSource, pcm: PcmAudio | null) => {
      pcmRef.current[source] = pcm;
      // New audio replaces the old result: stop whatever was playing so a
      // stale source is never heard.
      if (stateRef.current?.source === source) stopNow();
      else if (source === "processed") stopNow();
    },
    [stopNow],
  );

  useEffect(() => () => stopNow(), [stopNow]);

  return { playing, play, stop: stopNow, swapTo, setSource };
}
