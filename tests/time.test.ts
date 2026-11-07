import { describe, expect, it } from "vitest";
import { formatDuration, parseClock, parseIso, toOffsets } from "@/lib/time";

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

  it("formats durations", () => {
    expect(formatDuration(393)).toBe("06:33");
    expect(formatDuration(3723)).toBe("1:02:03");
  });
});
