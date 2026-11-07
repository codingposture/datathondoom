"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { formatDuration } from "@/lib/time";
import type { MessageDto } from "@/lib/types";
import { IconExternal, IconPause, IconPlay } from "./Icons";

export type PlayerHandle = { seek: (sec: number, play?: boolean) => void };

type Props = {
  messages: MessageDto[];
  durationSec: number;
  audioSrc: string | null;
  playerUrl?: string | null;
  highlight: { from: number; to: number } | null;
  onTime?: (sec: number) => void;
  onSegmentClick?: (idx: number) => void;
};

const BARS = 220;

type Seg = { idx: number; speaker: MessageDto["speaker"]; start: number; end: number };

export function buildSegments(messages: MessageDto[]): Seg[] {
  const spoken = messages.filter((m) => m.speaker !== "system");
  return spoken.map((m, i) => {
    const next = spoken[i + 1]?.offsetSec ?? m.offsetSec + 6;
    const est = Math.max(1.5, m.text.length * 0.065);
    return { idx: m.idx, speaker: m.speaker, start: m.offsetSec, end: Math.max(m.offsetSec + 0.5, Math.min(next, m.offsetSec + est)) };
  });
}

async function decodePeaks(buf: ArrayBuffer): Promise<{ peaks: number[]; duration: number }> {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    const audio = await ctx.decodeAudioData(buf.slice(0));
    const data = audio.getChannelData(0);
    const step = Math.floor(data.length / BARS) || 1;
    const peaks: number[] = [];
    for (let i = 0; i < BARS; i++) {
      let max = 0;
      const end = Math.min(data.length, (i + 1) * step);
      for (let j = i * step; j < end; j += 16) max = Math.max(max, Math.abs(data[j]));
      peaks.push(max);
    }
    const top = Math.max(...peaks, 0.01);
    return { peaks: peaks.map((p) => Math.pow(p / top, 0.7)), duration: audio.duration };
  } finally {
    ctx.close().catch(() => {});
  }
}

export const ConversationPlayer = forwardRef<PlayerHandle, Props>(function ConversationPlayer(
  { messages, durationSec, audioSrc, playerUrl, highlight, onTime, onSegmentClick },
  ref,
) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [audioDur, setAudioDur] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(audioSrc ? "loading" : "idle");
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  const segments = useMemo(() => buildSegments(messages), [messages]);
  const total = Math.max(audioDur ?? 0, durationSec, segments.length ? segments[segments.length - 1].end : 0, 1);

  // Download once, decode peaks for the two-lane waveform, and play from a blob URL.
  useEffect(() => {
    if (!audioSrc) return;
    let url: string | null = null;
    let alive = true;
    setStatus("loading");
    (async () => {
      try {
        const res = await fetch(audioSrc);
        if (!res.ok) throw new Error(String(res.status));
        const buf = await res.arrayBuffer();
        const type = res.headers.get("content-type") ?? "audio/mpeg";
        url = URL.createObjectURL(new Blob([buf], { type }));
        if (!alive) return;
        setBlobUrl(url);
        setStatus("ready");
        try {
          const { peaks, duration } = await decodePeaks(buf);
          if (alive) {
            setPeaks(peaks);
            setAudioDur(duration);
          }
        } catch {
          /* playable but not decodable: lanes fall back to speech segments */
        }
      } catch {
        if (alive) setStatus("error");
      }
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [audioSrc]);

  useImperativeHandle(ref, () => ({
    seek(sec, play = true) {
      const a = audioRef.current;
      setTime(sec);
      onTime?.(sec);
      if (a && blobUrl) {
        a.currentTime = sec;
        if (play) a.play().catch(() => {});
      }
    },
  }));

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  const onSeekInput = (sec: number) => {
    setTime(sec);
    onTime?.(sec);
    if (audioRef.current && blobUrl) audioRef.current.currentTime = sec;
  };

  const speakerAt = (sec: number) => segments.find((s) => sec >= s.start && sec < s.end)?.speaker ?? null;
  const pct = (sec: number) => `${(Math.max(0, Math.min(total, sec)) / total) * 100}%`;
  const hl = highlight ? { left: pct(highlight.from), width: `calc(${pct(highlight.to)} - ${pct(highlight.from)})` } : null;

  const lane = (which: "client" | "operator") => {
    if (peaks) {
      const w = 100 / peaks.length;
      return (
        <svg width="100%" height="34" preserveAspectRatio="none" viewBox="0 0 100 34" aria-hidden>
          {peaks.map((p, i) => {
            const sec = (i / peaks.length) * total;
            const sp = speakerAt(sec);
            const mine = which === "client" ? sp === "client" : sp === "operator" || sp === "bot";
            const h = mine ? Math.max(2, p * 32) : 1.5;
            const color = !mine ? "var(--border-strong)" : sp === "client" ? "var(--client)" : sp === "bot" ? "var(--bot)" : "var(--operator)";
            return <rect key={i} x={i * w + w * 0.18} width={w * 0.64} y={17 - h / 2} height={h} fill={color} opacity={sec <= time ? 1 : 0.55} rx={0.2} />;
          })}
        </svg>
      );
    }
    return (
      <>
        <div style={{ position: "absolute", left: 0, right: 0, top: 16, height: 1.5, background: "var(--border)" }} />
        {segments
          .filter((s) => (which === "client" ? s.speaker === "client" : s.speaker !== "client"))
          .map((s) => (
            <div
              key={s.idx}
              className={`seg seg--${s.speaker}`}
              style={{ left: pct(s.start), width: `max(3px, calc(${pct(s.end)} - ${pct(s.start)}))` }}
              title={`#${s.idx} · ${formatDuration(s.start)}`}
              onClick={() => onSegmentClick?.(s.idx)}
            />
          ))}
      </>
    );
  };

  const isAudio = Boolean(audioSrc);
  return (
    <div className="card player">
      <div className="player__lanes">
        <span className="player__lane-label">{t("speaker.client")}</span>
        <div className="player__lane">
          {lane("client")}
          {hl ? <div className="player__highlight" style={hl} /> : null}
          <div className="player__cursor" style={{ left: pct(time) }} />
        </div>
        <span className="player__lane-label">{t("speaker.operator")}</span>
        <div className="player__lane">
          {lane("operator")}
          {hl ? <div className="player__highlight" style={hl} /> : null}
          <div className="player__cursor" style={{ left: pct(time) }} />
        </div>
      </div>
      <div className="player__controls">
        {isAudio ? (
          <button className="player__play" onClick={toggle} disabled={status !== "ready"} aria-label={playing ? "pause" : "play"}>
            {playing ? <IconPause /> : <IconPlay />}
          </button>
        ) : null}
        <span className="player__time">
          {formatDuration(time)} / {formatDuration(total)}
        </span>
        <input className="player__seek" type="range" min={0} max={total} step={0.1} value={Math.min(time, total)} onChange={(e) => onSeekInput(Number(e.target.value))} aria-label="seek" />
        {playerUrl ? (
          <a className="btn btn--ghost btn--sm" href={playerUrl} target="_blank" rel="noreferrer" title={t("card.openPlayer")}>
            <IconExternal />
          </a>
        ) : null}
      </div>
      {isAudio && status === "loading" ? <div className="player__status">{t("card.audioLoading")}</div> : null}
      {isAudio && status === "error" ? <div className="player__status" style={{ color: "var(--danger)" }}>{t("card.audioError")}</div> : null}
      {!isAudio ? <div className="player__status">{t("card.timeline")}</div> : null}
      {blobUrl ? (
        <audio
          ref={audioRef}
          src={blobUrl}
          preload="auto"
          onTimeUpdate={(e) => {
            const s = e.currentTarget.currentTime;
            setTime(s);
            onTime?.(s);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setAudioDur(e.currentTarget.duration)}
        />
      ) : null}
    </div>
  );
});
