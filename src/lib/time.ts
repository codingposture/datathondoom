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

/** Formats seconds as M:SS or H:MM:SS. */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}
