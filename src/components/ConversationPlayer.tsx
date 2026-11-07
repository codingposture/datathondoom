"use client";

// Call recording player built on wavesurfer.js (waveform, playback, seeking) with the
// Regions plugin (highlighted fragment) and the Timeline plugin (time ruler).
// The waveform is drawn in two speaker lanes — Client on top, Operator below — using each
// message's aligned position in the recording (audioStart/audioEnd).
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type WaveSurfer from "wavesurfer.js";
import type RegionsPlugin from "wavesurfer.js/plugins/regions";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { formatDuration } from "@/lib/time";
import type { MessageDto } from "@/lib/types";
import { IconExternal, IconPause, IconPlay } from "./Icons";

export type PlayerHandle = { seek: (sec: number, play?: boolean) => void };

type Props = {
  messages: MessageDto[];
  audioSrc: string;
  playerUrl?: string | null;
  highlight: { from: number; to: number } | null;
  onTime?: (sec: number) => void;
};

export type Seg = { idx: number; speaker: MessageDto["speaker"]; start: number; end: number };

/** Spoken messages that are part of the recording, with their position in the audio. */
export function buildSegments(messages: MessageDto[]): Seg[] {
  return messages
    .filter((m) => m.speaker !== "system" && m.audioStart !== null && m.audioEnd !== null)
    .map((m) => ({ idx: m.idx, speaker: m.speaker, start: m.audioStart as number, end: m.audioEnd as number }));
}

const COLORS = { client: "#17362c", operator: "#2e8655", bot: "#9ba8a3", other: "#d3ddd7" };
const HEIGHT = 84;
const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export const ConversationPlayer = forwardRef<PlayerHandle, Props>(function ConversationPlayer(
  { messages, audioSrc, playerUrl, highlight, onTime },
  ref,
) {
  const { t } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const timeline = useRef<HTMLDivElement>(null);
  const ws = useRef<WaveSurfer | null>(null);
  const regions = useRef<RegionsPlugin | null>(null);
  const onTimeRef = useRef(onTime);
  onTimeRef.current = onTime;

  const segments = useMemo(() => buildSegments(messages), [messages]);
  const segRef = useRef(segments);
  segRef.current = segments;

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const pendingSeek = useRef<{ sec: number; play: boolean } | null>(null);

  useEffect(() => {
    if (!container.current) return;
    let destroyed = false;
    let instance: WaveSurfer | null = null;

    (async () => {
      const [{ default: WaveSurferCtor }, { default: Regions }, { default: Timeline }] = await Promise.all([
        import("wavesurfer.js"),
        import("wavesurfer.js/plugins/regions"),
        import("wavesurfer.js/plugins/timeline"),
      ]);
      if (destroyed || !container.current) return;

      const regionsPlugin = Regions.create();
      instance = WaveSurferCtor.create({
        container: container.current,
        url: audioSrc,
        height: HEIGHT,
        waveColor: COLORS.other,
        // The played part is darkened on top of the speaker colors.
        progressColor: "rgba(16, 55, 44, 0.42)",
        cursorColor: "#10372c",
        cursorWidth: 2,
        normalize: true,
        dragToSeek: true,
        // No barWidth: the waveform stays one canvas, so bar positions map directly to time.
        renderFunction: (peaks, ctx) => drawLanes(peaks, ctx, segRef.current, instance?.getDuration() ?? 0),
        plugins: [
          regionsPlugin,
          Timeline.create({
            container: timeline.current ?? undefined,
            height: 16,
            timeInterval: 10,
            primaryLabelInterval: 6,
            secondaryLabelInterval: 0,
            formatTimeCallback: (s: number) => formatDuration(s),
            style: { fontSize: "11px", color: "#8a9a94" },
          }),
        ],
      });
      ws.current = instance;
      regions.current = regionsPlugin;

      instance.on("ready", (d) => {
        setDuration(d);
        setStatus("ready");
        const p = pendingSeek.current;
        if (p) {
          instance!.setTime(p.sec);
          if (p.play) instance!.play().catch(() => {});
          pendingSeek.current = null;
        }
      });
      instance.on("error", () => setStatus("error"));
      instance.on("timeupdate", (s) => {
        setTime(s);
        onTimeRef.current?.(s);
      });
      instance.on("play", () => setPlaying(true));
      instance.on("pause", () => setPlaying(false));
      instance.on("finish", () => setPlaying(false));
    })().catch(() => setStatus("error"));

    return () => {
      destroyed = true;
      instance?.destroy();
      ws.current = null;
      regions.current = null;
    };
  }, [audioSrc]);

  // Re-draw lanes when the message alignment changes.
  useEffect(() => {
    const w = ws.current;
    if (w && status === "ready") w.setOptions({ renderFunction: (peaks, ctx) => drawLanes(peaks, ctx, segments, w.getDuration()) });
  }, [segments, status]);

  // Highlighted fragment = a non-editable region.
  useEffect(() => {
    const r = regions.current;
    if (!r || status !== "ready") return;
    r.clearRegions();
    if (highlight && highlight.to > highlight.from) {
      r.addRegion({ start: highlight.from, end: highlight.to, color: "rgba(182, 242, 149, 0.42)", drag: false, resize: false });
    }
  }, [highlight, status]);

  useImperativeHandle(ref, () => ({
    seek(sec, play = true) {
      const w = ws.current;
      if (!w || status !== "ready") {
        pendingSeek.current = { sec, play };
        return;
      }
      w.setTime(Math.max(0, Math.min(sec, w.getDuration())));
      if (play) w.play().catch(() => {});
    },
  }));

  const changeSpeed = (s: number) => {
    setSpeed(s);
    ws.current?.setPlaybackRate(s, true);
  };

  return (
    <div className="card player">
      <div className="player__lanes">
        <div className="player__labels" style={{ height: HEIGHT }}>
          <span className="player__lane-label">{t("speaker.client")}</span>
          <span className="player__lane-label">{t("speaker.operator")}</span>
        </div>
        <div className="player__wave-wrap">
          <div ref={container} className="player__wave" aria-label="waveform" />
          <div ref={timeline} className="player__timeline" />
          {status === "loading" ? <div className="player__overlay">{t("card.audioLoading")}</div> : null}
        </div>
      </div>
      <div className="player__controls">
        <button className="player__play" onClick={() => ws.current?.playPause()} disabled={status !== "ready"} aria-label={playing ? "pause" : "play"}>
          {playing ? <IconPause /> : <IconPlay />}
        </button>
        <span className="player__time">
          {formatDuration(time)} / {formatDuration(duration)}
        </span>
        <span className="player__legend">
          <i style={{ background: COLORS.client }} /> {t("speaker.client")}
          <i style={{ background: COLORS.operator }} /> {t("speaker.operator")}
          <i style={{ background: COLORS.bot }} /> {t("speaker.bot")}
        </span>
        <span className="spacer" />
        <select className="select select--sm" value={speed} onChange={(e) => changeSpeed(Number(e.target.value))} aria-label="speed" disabled={status !== "ready"}>
          {SPEEDS.map((s) => (
            <option key={s} value={s}>{s}×</option>
          ))}
        </select>
        {playerUrl ? (
          <a className="btn btn--ghost btn--sm" href={playerUrl} target="_blank" rel="noreferrer" title={t("card.openPlayer")}>
            <IconExternal />
          </a>
        ) : null}
      </div>
      {status === "error" ? <div className="player__status" style={{ color: "var(--danger)" }}>{t("card.audioError")}</div> : null}
    </div>
  );
});

/**
 * Custom wavesurfer render function: draws the (mono) waveform as bars split into two lanes.
 * A bar goes to the Client lane or the Operator lane depending on who speaks at that moment
 * according to the aligned transcript; audio not attributed to anyone is drawn faintly in both.
 */
function drawLanes(peaks: Array<Float32Array | number[]>, ctx: CanvasRenderingContext2D, segs: Seg[], duration: number) {
  const { width, height } = ctx.canvas;
  const data = peaks[0];
  if (!data || !data.length || !duration) return;
  const dpr = Math.max(1, Math.round(width / Math.max(1, ctx.canvas.clientWidth || width)));
  const bar = 2 * dpr;
  const gap = 1 * dpr;
  const n = Math.floor(width / (bar + gap));
  const laneH = height / 2;
  const half = laneH * 0.42;
  const per = data.length / n;

  // Per-bar amplitude (max of absolute samples), normalised to the loudest bar.
  const amp = new Float32Array(n);
  let top = 0;
  for (let i = 0; i < n; i++) {
    let m = 0;
    const from = Math.floor(i * per);
    const to = Math.min(data.length, Math.floor((i + 1) * per));
    for (let j = from; j < to; j++) {
      const v = Math.abs(data[j]);
      if (v > m) m = v;
    }
    amp[i] = m;
    if (m > top) top = m;
  }
  if (top === 0) top = 1;

  let k = 0; // segments are time-ordered; walk them alongside the bars
  for (let i = 0; i < n; i++) {
    const sec = ((i + 0.5) / n) * duration;
    while (k < segs.length && segs[k].end < sec) k++;
    let who: Seg["speaker"] | null = null;
    for (let j = Math.max(0, k - 2); j < Math.min(segs.length, k + 3); j++) {
      if (sec >= segs[j].start && sec <= segs[j].end) {
        who = segs[j].speaker;
        break;
      }
    }
    // Square-root-ish curve keeps quiet speech visible next to loud passages.
    const h = Math.max(1 * dpr, Math.pow(amp[i] / top, 0.6) * half);
    const x = i * (bar + gap);
    const lane = (row: 0 | 1, color: string, hh: number) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, row * laneH + laneH / 2 - hh, bar, hh * 2);
    };
    if (who === "client") {
      lane(0, COLORS.client, h);
      lane(1, COLORS.other, 1 * dpr);
    } else if (who === "operator" || who === "bot") {
      lane(1, who === "bot" ? COLORS.bot : COLORS.operator, h);
      lane(0, COLORS.other, 1 * dpr);
    } else {
      lane(0, COLORS.other, h * 0.45);
      lane(1, COLORS.other, h * 0.45);
    }
  }
}
