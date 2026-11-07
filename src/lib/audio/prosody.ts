// Objective voice metrics for a call recording (no transcription involved).
// The recording is mono, so "who speaks when" comes from the transcript-aligned spans (audioStart/audioEnd);
// everything else is measured from the signal: pitch (F0), loudness, silences, overlaps.
//
// Method notes (validated on the 5 DEV calls against Praat/parselmouth):
//  * F0 by normalized autocorrelation on 40 ms frames (10 ms hop) at 8 kHz, 60–400 Hz, with per-speaker
//    octave-jump filtering; intonation = pitch variation inside phrases, in semitones.
//  * Loudness = frame energy in dB relative to the file; arousal = z(pitch) + z(loudness) vs the speaker's own baseline.
import type { MessageDto } from "../types";

export const AUDIO_METRICS_VERSION = 1;

export interface UtteranceVoice {
  idx: number;
  t: number; // seconds into the recording
  f0Hz: number; // median pitch
  f0SdSt: number; // pitch variation inside the phrase (semitones)
  db: number; // mean loudness of active frames (dB, file-relative)
  arousal: number; // z-score vs speaker baseline
}

export interface SpeakerVoice {
  utterances: number;
  speechSec: number;
  f0MedianHz: number;
  f0RangeSt: number; // p5–p95 over the call, semitones
  withinUttF0SdSt: number; // mean pitch variation inside phrases — the intonation measure
  intensityDb: number;
  intensitySdDb: number;
  perUtterance: UtteranceVoice[];
}

export interface AudioMetrics {
  version: number;
  durationSec: number;
  operator: SpeakerVoice | null;
  client: SpeakerVoice | null;
  responseLatency: { medianSec: number | null; p90Sec: number | null; count: number };
  /** Dead air: no speech for ≥ 5 s after the operator joined. */
  silences: { fromSec: number; durSec: number; beforeIdx: number | null; afterIdx: number | null; duringHold: boolean }[];
  /** Operator started talking while the client was still speaking (≥ 1 s of overlapping speech). */
  overlaps: { operatorIdx: number; clientIdx: number; atSec: number; overlapSec: number }[];
  /** Client phrases that sound agitated (pitch + loudness well above the client's own baseline). */
  clientUpset: { idx: number; t: number; arousal: number }[];
  /** Operator phrases noticeably louder/higher than the operator's own baseline. */
  operatorRaised: { idx: number; t: number; dbOver: number; stOver: number }[];
}

const SR = 8000;
const HOP = 80; // 10 ms
const WIN = 320; // 40 ms
const LAG_MIN = Math.floor(SR / 400);
const LAG_MAX = Math.ceil(SR / 60);
const EDGE = 0.15; // trim alignment uncertainty at phrase edges

const median = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (a: number[], p: number) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))];
};
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const sd = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
};
const st = (hz: number, ref: number) => 12 * Math.log2(hz / ref);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Mixes to mono and downsamples to 8 kHz (box filter + decimation). */
export function toMono8k(channels: Float32Array[], sampleRate: number): Float32Array {
  const n = channels[0]?.length ?? 0;
  const mono = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) mono[i] += ch[i] / channels.length;
  if (sampleRate === SR) return mono;
  const ratio = sampleRate / SR;
  const out = new Float32Array(Math.floor(n / ratio));
  const k = Math.max(1, Math.round(ratio));
  for (let j = 0; j < out.length; j++) {
    const c = Math.floor(j * ratio);
    let s = 0;
    let m = 0;
    for (let i = c; i < Math.min(n, c + k); i++) {
      s += mono[i];
      m++;
    }
    out[j] = m ? s / m : 0;
  }
  return out;
}

/** Frame energies in dB. */
function frameDb(x: Float32Array): Float32Array {
  const frames = Math.max(0, Math.floor((x.length - WIN) / HOP) + 1);
  const db = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let e = 0;
    const o = f * HOP;
    for (let i = 0; i < WIN; i++) e += x[o + i] * x[o + i];
    db[f] = 10 * Math.log10(e / WIN + 1e-12);
  }
  return db;
}

/** Pitch of one frame by normalized autocorrelation; 0 when unvoiced. */
function framePitch(x: Float32Array, o: number): number {
  if (o + WIN + LAG_MAX >= x.length) return 0;
  let e0 = 0;
  for (let i = 0; i < WIN; i++) e0 += x[o + i] * x[o + i];
  if (e0 <= 1e-9) return 0;
  let best = 0;
  let bestLag = 0;
  const r = new Float32Array(LAG_MAX + 2);
  for (let lag = LAG_MIN; lag <= LAG_MAX + 1; lag++) {
    let c = 0;
    let e1 = 0;
    for (let i = 0; i < WIN; i++) {
      const b = x[o + i + lag];
      c += x[o + i] * b;
      e1 += b * b;
    }
    const v = c / Math.sqrt(e0 * e1 + 1e-12);
    r[lag] = v;
  }
  // Prefer the shortest lag whose peak is close to the global maximum (avoids sub-harmonic errors).
  for (let lag = LAG_MIN; lag <= LAG_MAX; lag++) if (r[lag] > best) best = r[lag];
  if (best < 0.5) return 0;
  for (let lag = LAG_MIN + 1; lag <= LAG_MAX; lag++) {
    if (r[lag] >= 0.9 * best && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) {
      bestLag = lag;
      break;
    }
  }
  if (!bestLag) return 0;
  const a = r[bestLag - 1];
  const b = r[bestLag];
  const c = r[bestLag + 1];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  return SR / (bestLag + Math.max(-0.5, Math.min(0.5, shift)));
}

type Span = { idx: number; speaker: MessageDto["speaker"]; start: number; end: number };

function speakerVoice(x: Float32Array, db: Float32Array, active: Uint8Array, spans: Span[], durationSec: number): SpeakerVoice | null {
  type Raw = { s: Span; f0: number[]; db: number[]; dur: number };
  const raws: Raw[] = [];
  for (const s of spans) {
    const a = Math.max(0, s.start + EDGE);
    const b = Math.min(durationSec, s.end - EDGE);
    if (b - a < 0.35) continue;
    const f0: number[] = [];
    const dbs: number[] = [];
    for (let f = Math.floor((a * SR) / HOP); f < Math.min(db.length, Math.floor((b * SR) / HOP)); f++) {
      if (!active[f]) continue;
      dbs.push(db[f]);
      const p = framePitch(x, f * HOP);
      if (p > 0) f0.push(p);
    }
    raws.push({ s, f0, db: dbs, dur: b - a });
  }
  const all = raws.flatMap((r) => r.f0);
  if (all.length < 30) return null;
  // Octave-jump filter around the speaker's median.
  const m0 = median(all);
  const lo = m0 / 1.8;
  const hi = m0 * 1.8;
  const utts: UtteranceVoice[] = [];
  const kept: number[] = [];
  let speech = 0;
  for (const r of raws) {
    speech += r.dur;
    const f0 = r.f0.filter((v) => v >= lo && v <= hi);
    if (f0.length < 8 || !r.db.length) continue;
    kept.push(...f0);
    const um = median(f0);
    utts.push({ idx: r.s.idx, t: r1(r.s.start), f0Hz: um, f0SdSt: sd(f0.map((v) => st(v, um))), db: mean(r.db), arousal: 0 });
  }
  if (!utts.length) return null;
  const med = median(kept);
  const sems = kept.map((v) => st(v, med));
  const uSt = utts.map((u) => st(u.f0Hz, med));
  const uDb = utts.map((u) => u.db);
  const z = (a: number[]) => {
    const m = mean(a);
    const s = sd(a) || 1;
    return a.map((v) => (v - m) / s);
  };
  const zs = z(uSt);
  const zd = z(uDb);
  utts.forEach((u, i) => {
    u.arousal = r2((zs[i] + zd[i]) / 2);
    u.f0Hz = r1(u.f0Hz);
    u.f0SdSt = r2(u.f0SdSt);
    u.db = r1(u.db);
  });
  // Pitch variation inside phrases, weighted by phrase length.
  const w = utts.map((u) => raws.find((r) => r.s.idx === u.idx)?.dur ?? 1);
  const within = utts.reduce((s, u, i) => s + u.f0SdSt * w[i], 0) / w.reduce((s, v) => s + v, 0);
  return {
    utterances: utts.length,
    speechSec: r1(speech),
    f0MedianHz: r1(med),
    f0RangeSt: r2(pct(sems, 95) - pct(sems, 5)),
    withinUttF0SdSt: r2(within),
    intensityDb: r1(mean(uDb)),
    intensitySdDb: r2(sd(uDb)),
    perUtterance: utts,
  };
}

const HOLD_ON = ["на удержании", "on hold", "күтуге қойылды"];
const HOLD_OFF = ["больше не находится на удержании", "no longer on hold", "күтуден шықты"];

/** Computes all voice metrics for a decoded recording and its aligned transcript. */
export function analyseVoice(channels: Float32Array[], sampleRate: number, messages: MessageDto[]): AudioMetrics {
  const x = toMono8k(channels, sampleRate);
  const durationSec = x.length / SR;
  const db = frameDb(x);
  const floor = pct(Array.from(db.filter((_, i) => i % 5 === 0)), 10);
  const loud = pct(Array.from(db.filter((_, i) => i % 5 === 0)), 95);
  const thr = Math.max(floor + 10, loud - 35);
  const active = new Uint8Array(db.length);
  for (let i = 0; i < db.length; i++) active[i] = db[i] > thr ? 1 : 0;

  const spans: Span[] = messages
    .filter((m) => m.audioStart !== null && m.audioEnd !== null && m.speaker !== "system")
    .map((m) => ({ idx: m.idx, speaker: m.speaker, start: m.audioStart as number, end: m.audioEnd as number }))
    .sort((a, b) => a.start - b.start);
  const op = spans.filter((s) => s.speaker === "operator");
  const cl = spans.filter((s) => s.speaker === "client");

  const operator = speakerVoice(x, db, active, op, durationSec);
  const client = speakerVoice(x, db, active, cl, durationSec);

  // Response latency: client phrase end → next operator phrase start.
  const lat: number[] = [];
  const conv = spans.filter((s) => s.speaker === "operator" || s.speaker === "client");
  for (let i = 1; i < conv.length; i++) {
    if (conv[i - 1].speaker === "client" && conv[i].speaker === "operator") lat.push(Math.max(0, conv[i].start - conv[i - 1].end));
  }

  // Hold intervals from system events.
  const holds: { from: number; to: number }[] = [];
  let holdFrom: number | null = null;
  for (const m of messages) {
    if (m.speaker !== "system" || m.audioStart === null) continue;
    const t = m.text.toLowerCase();
    if (HOLD_OFF.some((k) => t.includes(k))) {
      if (holdFrom !== null) holds.push({ from: holdFrom, to: m.audioStart });
      holdFrom = null;
    } else if (HOLD_ON.some((k) => t.includes(k))) holdFrom = m.audioStart;
  }
  if (holdFrom !== null) holds.push({ from: holdFrom, to: durationSec });

  // Dead air ≥ 5 s after the operator joined.
  const silences: AudioMetrics["silences"] = [];
  const opStart = op[0]?.start ?? durationSec;
  const lastSpeech = spans.length ? spans[spans.length - 1].end : durationSec;
  let run = 0;
  for (let f = 0; f <= db.length; f++) {
    if (f < db.length && !active[f]) {
      run++;
      continue;
    }
    if (run * (HOP / SR) >= 5) {
      const from = ((f - run) * HOP) / SR;
      const to = (f * HOP) / SR;
      if (from >= opStart && to <= lastSpeech + 1) {
        const before = [...spans].reverse().find((s) => s.start <= from);
        const after = spans.find((s) => s.start >= to - 1.5);
        silences.push({
          fromSec: r1(from),
          durSec: r1(to - from),
          beforeIdx: before?.idx ?? null,
          afterIdx: after?.idx ?? null,
          duringHold: holds.some((h) => from >= h.from - 2 && from <= h.to),
        });
      }
    }
    run = 0;
  }

  // Interruptions: operator phrase starts while a client phrase is still going, with ≥ 1 s of active overlap.
  const overlaps: AudioMetrics["overlaps"] = [];
  for (const o of op) {
    const c = cl.find((s) => s.start < o.start - 0.3 && s.end > o.start + 1.0);
    if (!c) continue;
    const a = o.start;
    const b = Math.min(c.end, o.end);
    let act = 0;
    let tot = 0;
    for (let f = Math.floor((a * SR) / HOP); f < Math.min(db.length, Math.floor((b * SR) / HOP)); f++) {
      tot++;
      act += active[f];
    }
    if (b - a >= 1.0 && tot && act / tot >= 0.7) overlaps.push({ operatorIdx: o.idx, clientIdx: c.idx, atSec: r1(a), overlapSec: r1(b - a) });
  }

  // Emotional peaks.
  const clientUpset =
    client?.perUtterance
      .filter((u) => u.arousal >= 1.5 && u.db >= client.intensityDb + 2)
      .map((u) => ({ idx: u.idx, t: u.t, arousal: u.arousal })) ?? [];
  const opDbMed = operator ? median(operator.perUtterance.map((u) => u.db)) : 0;
  const operatorRaised =
    operator?.perUtterance
      .map((u) => ({ idx: u.idx, t: u.t, dbOver: r1(u.db - opDbMed), stOver: r1(st(u.f0Hz, operator.f0MedianHz)) }))
      .filter((u) => u.dbOver >= 6 && u.stOver >= 3) ?? [];

  return {
    version: AUDIO_METRICS_VERSION,
    durationSec: r1(durationSec),
    operator,
    client,
    responseLatency: { medianSec: lat.length ? r2(median(lat)) : null, p90Sec: lat.length ? r2(pct(lat, 90)) : null, count: lat.length },
    silences,
    overlaps,
    clientUpset,
    operatorRaised,
  };
}

/** Compact text summary of the metrics for LLM prompts (Russian). */
export function describeMetricsRu(m: AudioMetrics): string {
  const v = (s: SpeakerVoice | null, name: string) =>
    s
      ? `${name}: высота голоса ${s.f0MedianHz} Гц, вариативность интонации внутри фраз ${s.withinUttF0SdSt} полутонов (диапазон за звонок ${s.f0RangeSt} пт), громкость ${s.intensityDb} дБ ±${s.intensitySdDb}, фраз проанализировано ${s.utterances}`
      : `${name}: голос не удалось проанализировать`;
  return [
    v(m.operator, "Оператор"),
    v(m.client, "Клиент"),
    `Задержка ответа оператора: медиана ${m.responseLatency.medianSec ?? "—"} с, p90 ${m.responseLatency.p90Sec ?? "—"} с`,
    `Тишина ≥5 с: ${m.silences.length ? m.silences.map((s) => `${s.durSec} с с ${s.fromSec} с (после реплики #${s.beforeIdx}${s.duringHold ? ", во время удержания" : ""})`).join("; ") : "нет"}`,
    `Перебивания оператором (наложение речи ≥1 с): ${m.overlaps.length ? m.overlaps.map((o) => `#${o.operatorIdx} поверх #${o.clientIdx} (${o.overlapSec} с)`).join("; ") : "нет"}`,
    `Эмоциональные всплески клиента: ${m.clientUpset.length ? m.clientUpset.map((u) => `#${u.idx} (z=${u.arousal})`).join(", ") : "нет"}`,
    `Повышение голоса оператором: ${m.operatorRaised.length ? m.operatorRaised.map((u) => `#${u.idx} (+${u.dbOver} дБ, +${u.stOver} пт)`).join(", ") : "нет"}`,
  ].join("\n");
}
