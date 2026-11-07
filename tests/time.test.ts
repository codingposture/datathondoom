import { describe, expect, it } from "vitest";
import { alignToAudio, formatDuration, parseClock, parseIso, toOffsets } from "@/lib/time";

describe("time", () => {
  it("parses MM:SS and HH:MM:SS", () => {
    expect(parseClock("01:15")).toBe(75);
    expect(parseClock("1:02:03")).toBe(3723);
    expect(parseClock("2026-11-03T15:49:13Z")).toBeNull();
  });

  it("parses ISO timestamps with 7 fractional digits and offsets", () => {
    const a = parseIso("2026-11-03T15:49:13.1900670+00:00");
    const b = parseIso("2026-11-03T15:49:22.4171535+00:00");
    expect(a).not.toBeNull();
    expect(((b as number) - (a as number)) / 1000).toBeCloseTo(9.227, 2);
  });

  it("converts transcripts to offsets from the first message", () => {
    expect(toOffsets(["00:00", "00:02", "01:15"])).toEqual([0, 2, 75]);
    const iso = toOffsets(["2026-11-03T13:10:00.000+00:00", "2026-11-03T13:12:18.000+00:00"]);
    expect(iso).toEqual([0, 138]);
  });

  it("aligns call messages to the recording: start event, pauses, end-of-utterance stamps", () => {
    const cfg = { secPerChar: 0.1, minUtterance: 0.5, shift: 0, pauseKept: 2 };
    const msgs = [
      { offsetSec: 0, speaker: "operator", text: "before the recording" },
      { offsetSec: 10, speaker: "system", text: "Запись и транскрибирование запущены." },
      { offsetSec: 20, speaker: "bot", text: "0123456789" }, // 10 chars → 1 s, ends at 10 s of audio
      { offsetSec: 30, speaker: "system", text: "Запись и транскрибирование приостановлены." },
      { offsetSec: 35, speaker: "client", text: "said during the pause" },
      { offsetSec: 50, speaker: "system", text: "Запись и транскрибирование возобновлены." },
      { offsetSec: 60, speaker: "operator", text: "01234" }, // 60-10 = 50, minus (20-2) pause = 32
    ];
    const a = alignToAudio(msgs, cfg);
    expect(a[0]).toEqual({ audioStart: null, audioEnd: null });
    expect(a[2].audioEnd).toBeCloseTo(10);
    expect(a[2].audioStart).toBeCloseTo(9);
    expect(a[4]).toEqual({ audioStart: null, audioEnd: null });
    expect(a[6].audioEnd).toBeCloseTo(32);
    expect(a[6].audioStart).toBeCloseTo(31.5);
  });

  it("uses the first message as the recording start when there is no start event", () => {
    const a = alignToAudio([
      { offsetSec: 0, speaker: "client", text: "hi" },
      { offsetSec: 5, speaker: "operator", text: "hello" },
    ]);
    expect(a[1].audioEnd).toBeCloseTo(4);
  });

  it("formats durations", () => {
    expect(formatDuration(393)).toBe("06:33");
    expect(formatDuration(3723)).toBe("1:02:03");
  });
});
