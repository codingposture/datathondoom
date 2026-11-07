import { describe, expect, it } from "vitest";
import { normalize, round, scoreChecklist, validateAnswer } from "@/lib/scoring";
import type { ChecklistDef, CriterionDef } from "@/lib/types";

function crit(p: Partial<CriterionDef> & { id: string }): CriterionDef {
  return {
    code: p.id.toUpperCase(),
    title: p.id,
    description: "",
    sectionKey: null,
    answerType: "BINARY",
    scaleMin: 0,
    scaleMax: 1,
    weight: 10,
    naAllowed: false,
    naRule: "",
    isCritical: false,
    hints: {},
    order: 0,
    ...p,
  };
}

function checklist(criteria: CriterionDef[], extra: Partial<ChecklistDef> = {}): ChecklistDef {
  return {
    id: "cl",
    family: "f",
    name: "test",
    version: 1,
    isActive: true,
    decimals: 1,
    roundingMode: "half-up",
    criticalPolicy: "flag",
    sections: [],
    criteria: criteria.map((c, i) => ({ ...c, order: i })),
    ...extra,
  };
}

describe("round", () => {
  it("rounds half up", () => {
    expect(round(85.45, 1)).toBe(85.5);
    expect(round(2.5, 0)).toBe(3);
    expect(round(1.005, 2)).toBe(1.01);
  });
  it("supports floor and ceil", () => {
    expect(round(85.49, 1, "floor")).toBe(85.4);
    expect(round(85.41, 1, "ceil")).toBe(85.5);
  });
});

describe("normalize", () => {
  it("maps scales to 0..1", () => {
    const c = crit({ id: "s", answerType: "SCALE", scaleMin: 0, scaleMax: 3 });
    expect(normalize(c, "0")).toBe(0);
    expect(normalize(c, "2")).toBeCloseTo(2 / 3);
    expect(normalize(c, "3")).toBe(1);
    expect(normalize(c, "na")).toBeNull();
  });
  it("supports non-zero scale minimum", () => {
    const c = crit({ id: "s", answerType: "SCALE", scaleMin: 1, scaleMax: 5 });
    expect(normalize(c, "3")).toBe(0.5);
  });
});

describe("scoreChecklist", () => {
  const a = crit({ id: "a", weight: 20 });
  const b = crit({ id: "b", weight: 30, answerType: "SCALE", scaleMax: 2 });
  const c = crit({ id: "c", weight: 50, naAllowed: true });

  it("computes weighted total out of 100", () => {
    const r = scoreChecklist(checklist([a, b, c]), { a: "yes", b: "1", c: "yes" });
    expect(r.total).toBe(85); // 20 + 15 + 50
    expect(r.criteria.find((x) => x.criterionId === "b")?.points).toBe(15);
  });

  it("redistributes weight away from N/A criteria", () => {
    const r = scoreChecklist(checklist([a, b, c]), { a: "yes", b: "1", c: "na" });
    // applicable weight = 50 → a = 40/100, b = 60/100 at half
    expect(r.total).toBe(70);
    const sc = r.criteria.find((x) => x.criterionId === "c")!;
    expect(sc.maxPoints).toBe(0);
    expect(r.criteria.find((x) => x.criterionId === "a")?.maxPoints).toBe(40);
  });

  it("flags critical errors without zeroing by default", () => {
    const sec = crit({ id: "sec", weight: 10, isCritical: true });
    const r = scoreChecklist(checklist([a, sec]), { a: "yes", sec: "no" });
    expect(r.hasCriticalError).toBe(true);
    expect(r.total).toBe(66.7);
  });

  it("zeroes the total under zero-total policy", () => {
    const sec = crit({ id: "sec", weight: 10, isCritical: true });
    const r = scoreChecklist(checklist([a, sec], { criticalPolicy: "zero-total" }), { a: "yes", sec: "no" });
    expect(r.total).toBe(0);
    expect(r.hasCriticalError).toBe(true);
  });

  it("computes section scores", () => {
    const s1 = crit({ id: "s1", weight: 50, sectionKey: "x" });
    const s2 = crit({ id: "s2", weight: 50, sectionKey: "y" });
    const cl = checklist([s1, s2], {
      sections: [
        { key: "x", name: "X", order: 0 },
        { key: "y", name: "Y", order: 1 },
      ],
    });
    const r = scoreChecklist(cl, { s1: "yes", s2: "no" });
    expect(r.sections.map((s) => s.percent)).toEqual([100, 0]);
    expect(r.total).toBe(50);
  });

  it("re-scoring after an appeal changes the total", () => {
    const cl = checklist([a, b, c]);
    const before = scoreChecklist(cl, { a: "yes", b: "0", c: "yes" });
    const after = scoreChecklist(cl, { a: "yes", b: "2", c: "yes" });
    expect(before.total).toBe(70);
    expect(after.total).toBe(100);
  });

  it("returns 0 when everything is N/A", () => {
    const r = scoreChecklist(checklist([c]), { c: "na" });
    expect(r.total).toBe(0);
  });
});

describe("validateAnswer", () => {
  it("rejects N/A when not allowed and out-of-range scale values", () => {
    expect(() => validateAnswer(crit({ id: "x" }), "na")).toThrow();
    expect(() => validateAnswer(crit({ id: "x", answerType: "SCALE", scaleMax: 2 }), "3")).toThrow();
    expect(() => validateAnswer(crit({ id: "x", answerType: "SCALE", scaleMax: 2 }), "2")).not.toThrow();
  });
});
