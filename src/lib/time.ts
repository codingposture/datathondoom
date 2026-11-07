// Timestamp helpers. Chats use "MM:SS" (or "HH:MM:SS"), calls use ISO 8601 with a timezone.

const CLOCK_RE = /^(\d{1,3}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?$/;

/** Seconds since the start of the dialog for a clock-style timestamp, or null if not a clock. */
export function parseClock(ts: string): number | null {
  const m = CLOCK_RE.exec(ts.trim());
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const frac = m[4] ? Number(`0.${m[4]}`) : 0;
  if (m[3] !== undefined) return a * 3600 + b * 60 + Number(m[3]) + frac;
  return a * 60 + b + frac;
}

/** Epoch milliseconds for an ISO timestamp, or null. Handles 7-digit fractional seconds. */
export function parseIso(ts: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(ts)) return null;
  // JS Date accepts at most 3 fractional digits reliably.
  const normalized = ts.replace(/(\.\d{3})\d+/, "$1");
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? null : ms;
}

/** Converts all timestamps of a transcript to offsets (seconds) from the first message. */
export function toOffsets(timestamps: string[]): number[] {
  if (timestamps.length === 0) return [];
  const iso = timestamps.map(parseIso);
  if (iso.every((v) => v !== null)) {
    const start = iso[0] as number;
    return iso.map((v) => Math.max(0, ((v as number) - start) / 1000));
  }
  let last = 0;
  return timestamps.map((ts) => {
    const clock = parseClock(ts);
    if (clock !== null) {
      last = clock;
      return clock;
    }
    const isoMs = parseIso(ts);
    if (isoMs !== null && iso[0] !== null) {
      last = (isoMs - (iso[0] as number)) / 1000;
      return last;
    }
    return last; // unparseable: keep previous offset so ordering survives
  });
}

// ---------- Transcript → recording alignment ----------
//
// Call transcripts use wall-clock ISO timestamps, but the recording is not a straight copy of that clock:
//  * the recording starts at the "recording started" system event (messages before it are not in the audio);
//  * "recording paused" … "recording resumed" cuts that span out of the audio;
//  * each timestamp marks the END of an utterance (when the transcription line was finalized).
// The constants were fitted against speech detected in the 5 DEV recordings (ffmpeg silencedetect):
// overlap of predicted speech with real speech rose from 18–62% (naive offsets) to 76–88%.
export const AUDIO_ALIGNMENT = {
  /** Estimated speaking time per character of transcript text. */
  secPerChar: 0.06,
  /** Minimum length of an utterance, seconds. */
  minUtterance: 0.6,
  /** Constant correction between transcript clock and audio, seconds. */
  shift: -1.0,
  /** Seconds of each logged pause that are still present in the recording. */
  pauseKept: 5.0,
};

const REC_START = ["запущены", "запущена", "басталды", "recording started", "recording and transcription started"];
const REC_PAUSE = ["приостановлен", "тоқтатыл", "paused"];
const REC_RESUME = ["возобновлен", "жалғастырыл", "resumed"];
const has = (text: string, words: string[]) => {
  const t = text.toLowerCase();
  return words.some((w) => t.includes(w));
};

export type AlignInput = { offsetSec: number; speaker: string; text: string };
export type AudioSpan = { audioStart: number | null; audioEnd: number | null };

/**
 * Maps every message to its [start, end] position inside the recording, in seconds.
 * Messages that are not part of the recording (before it started or while it was paused) get nulls.
 */
export function alignToAudio(messages: AlignInput[], cfg = AUDIO_ALIGNMENT): AudioSpan[] {
  const recStartMsg = messages.find((m) => m.speaker === "system" && has(m.text, REC_START));
  const recStart = recStartMsg ? recStartMsg.offsetSec : messages[0]?.offsetSec ?? 0;

  const pauses: { from: number; to: number }[] = [];
  let open: number | null = null;
  for (const m of messages) {
    if (m.speaker !== "system") continue;
    if (has(m.text, REC_PAUSE)) open = m.offsetSec;
    else if (has(m.text, REC_RESUME) && open !== null) {
      pauses.push({ from: open, to: m.offsetSec });
      open = null;
    }
  }
  if (open !== null) pauses.push({ from: open, to: Number.POSITIVE_INFINITY });

  let lastStart = 0;
  return messages.map((m) => {
    const t = m.offsetSec;
    if (t < recStart) return { audioStart: null, audioEnd: null };
    const inPause = pauses.some((p) => t > p.from + cfg.pauseKept && t < p.to);
    if (inPause && m.speaker !== "system") return { audioStart: null, audioEnd: null };
    let x = t - recStart;
    for (const p of pauses) {
      if (t >= p.to) x -= Math.max(0, p.to - p.from - cfg.pauseKept);
      else if (t > p.from) x -= Math.max(0, t - p.from - cfg.pauseKept);
    }
    const end = Math.max(0, x + cfg.shift);
    if (m.speaker === "system") return { audioStart: end, audioEnd: end };
    const len = Math.max(cfg.minUtterance, m.text.length * cfg.secPerChar);
    // Keep transcript order: an utterance cannot start before the previous one started.
    const start = Math.max(0, lastStart, end - len);
    lastStart = start;
    return { audioStart: start, audioEnd: Math.max(end, start + cfg.minUtterance) };
  });
}

/** Formats seconds as M:SS or H:MM:SS. */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}
