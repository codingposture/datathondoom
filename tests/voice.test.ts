import { describe, expect, it } from "vitest";
import { analyseVoice } from "@/lib/audio/prosody";
import type { MessageDto } from "@/lib/types";

const SR = 16000;

/** Harmonic "voice" with a pitch contour f(t) (Hz), amplitude-modulated like syllables. */
function voice(seconds: number, f: (t: number) => number): Float32Array {
  const n = Math.round(seconds * SR);
  const x = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    phase += (2 * Math.PI * f(t)) / SR;
    const env = 0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t);
    x[i] = 0.3 * env * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase));
  }
  return x;
}

function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const msg = (idx: number, speaker: MessageDto["speaker"], start: number, end: number): MessageDto => ({
  idx,
  timestamp: "",
  offsetSec: start,
  speaker,
  text: "x",
  audioStart: start,
  audioEnd: end,
});

describe("voice analysis", () => {
  it("measures pitch and reads a steady tone as monotone", () => {
    const x = concat(voice(4, () => 150), voice(4, () => 150));
    const m = analyseVoice([x], SR, [msg(0, "operator", 0, 4), msg(1, "operator", 4, 8)]);
    expect(m.operator).not.toBeNull();
    expect(m.operator!.f0MedianHz).toBeGreaterThan(145);
    expect(m.operator!.f0MedianHz).toBeLessThan(155);
    expect(m.operator!.withinUttF0SdSt).toBeLessThan(0.5);
  });

  it("reads a pitch glide as expressive intonation", () => {
    const glide = (t: number) => 110 * Math.pow(2, Math.sin(2 * Math.PI * 0.5 * t) * 0.5); // ±6 semitones
    const x = concat(voice(4, glide), voice(4, glide));
    const m = analyseVoice([x], SR, [msg(0, "operator", 0, 4), msg(1, "operator", 4, 8)]);
    expect(m.operator!.withinUttF0SdSt).toBeGreaterThan(3);
  });

  it("finds dead air before the operator's reply", () => {
    const x = concat(voice(3, () => 200), new Float32Array(8 * SR), voice(3, () => 120), voice(3, () => 200));
    const m = analyseVoice([x], SR, [msg(0, "operator", 0, 3), msg(1, "client", 3, 3.2), msg(2, "operator", 11, 14), msg(3, "client", 14, 17)]);
    expect(m.silences.length).toBe(1);
    expect(m.silences[0].durSec).toBeGreaterThanOrEqual(7.5);
    expect(m.silences[0].afterIdx).toBe(2);
  });
});
