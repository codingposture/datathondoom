import { describe, expect, it } from "vitest";
import { OFFICIAL_CRITERIA, OFFICIAL_SECTIONS } from "@/lib/officialChecklist";
import { buildEntry, describeModels, entryFor, toResultValue, validateResults, type ResultsFile } from "@/lib/results";
import { snapToSteps } from "@/lib/scoring";
import type { ChecklistDef, EvaluationDto } from "@/lib/types";

const checklist: ChecklistDef = {
  id: "cl",
  family: "official",
  name: "official",
  version: 1,
  isActive: false,
  decimals: 2,
  roundingMode: "half-up",
  criticalPolicy: "flag",
  sections: OFFICIAL_SECTIONS,
  criteria: OFFICIAL_CRITERIA.map((c, i) => ({ ...c, id: c.code, order: i })),
};

function evaluation(answers: Record<string, string>): EvaluationDto {
  return {
    id: "e1",
    conversationId: "demo-001",
    checklistId: "cl",
    checklist,
    evaluator: "two-stage-ai-v1:groq:openai/gpt-oss-120b",
    originalTotal: 0,
    finalTotal: 0,
    hasCriticalError: false,
    finalCritical: false,
    sectionScores: [],
    finalSections: [],
    createdAt: "",
    appeals: [],
    results: checklist.criteria.map((c) => ({
      id: `r-${c.code}`,
      criterionId: c.id,
      code: c.code,
      answer: answers[c.code],
      points: 0,
      maxPoints: 0,
      effectiveWeight: 0,
      explanation: `${c.code} rationale`,
      evidenceIdx: [3],
      checkedFrom: null,
      checkedTo: null,
      naReason: answers[c.code] === "na" ? "not applicable" : null,
      finalAnswer: answers[c.code],
      finalPoints: 0,
      finalMaxPoints: 0,
    })),
  };
}

describe("results.json export", () => {
  // The appendix's own example: contact true, discovery null, identification null, consultation 15,
  // empathy true, dialogue 7, closure true, critical false → final_score 85.38.
  const example = { contact: "yes", discovery: "na", identification: "na", consultation: "15", empathy: "yes", dialogue: "7", closure: "yes", critical: "yes" };

  it("reproduces the organizers' example score", () => {
    const e = buildEntry("demo-001", 10, evaluation(example));
    expect(e.status).toBe("ok");
    if (e.status !== "ok") return;
    expect(e.score).toEqual({ final_score: 85.38, critical_flag: false });
    expect(e.criteria.map((c) => [c.criterion_id, c.value])).toEqual([
      ["contact", true],
      ["discovery", null],
      ["identification", null],
      ["consultation", 15],
      ["empathy", true],
      ["dialogue", 7],
      ["closure", true],
      ["critical", false],
    ]);
    expect(e.criteria[0].evidence_turns).toEqual([4]); // idx 3 → turn 4 (1-based)
  });

  it("flags a critical violation without zeroing the score", () => {
    const e = buildEntry("demo-001", 10, evaluation({ ...example, critical: "no" }));
    if (e.status !== "ok") throw new Error("expected ok");
    expect(e.score.critical_flag).toBe(true);
    expect(e.score.final_score).toBe(85.38);
    expect(toResultValue("critical", "no")).toBe(true);
  });

  it("snaps scale answers to the official steps", () => {
    const consultation = checklist.criteria.find((c) => c.code === "consultation")!;
    const dialogue = checklist.criteria.find((c) => c.code === "dialogue")!;
    expect(snapToSteps(consultation, "12")).toBe("10");
    expect(snapToSteps(consultation, "18")).toBe("20");
    expect(snapToSteps(dialogue, "8")).toBe("7");
    expect(snapToSteps(dialogue, "na")).toBe("na");
  });

  it("validates structure, values and IDs", () => {
    const ok = buildEntry("demo-001", 10, evaluation(example));
    const file: ResultsFile = { schema_version: "1.0", team_name: "t", model: describeModels(["x:groq:openai/gpt-oss-120b"]), results: [ok] };
    expect(validateResults(file, ["demo-001"])).toEqual([]);
    expect(file.model).toEqual({ mode: "external_api", name: "openai/gpt-oss-120b (Groq)" });
    const bad: ResultsFile = { ...file, results: [ok, ok] };
    expect(validateResults(bad, ["demo-001", "demo-002"]).join(" ")).toMatch(/duplicate.*demo-002: missing/);
    expect(validateResults(file, ["demo-001"], 10)[0]).toMatch(/exactly 10/);
  });
});

describe("team checklist v4 → official IDs", () => {
  const mk = (code: string, answerType: "BINARY" | "SCALE", scaleMax: number, naAllowed = false) => ({
    id: code, code, title: code, description: "", sectionKey: null, answerType, scaleMin: 0, scaleMax, weight: 10, naAllowed, naRule: "", isCritical: code === "C4", hints: {}, order: 0,
  });
  const v4: ChecklistDef = {
    ...checklist,
    name: "Базовый чек-лист CQA",
    version: 4,
    sections: [],
    criteria: [mk("C1", "BINARY", 1), mk("C2", "SCALE", 2), mk("C3", "SCALE", 3), mk("C4", "BINARY", 1), mk("C5", "SCALE", 2), mk("C6", "BINARY", 1, true), mk("C7", "BINARY", 1, true), mk("C8", "BINARY", 1), mk("V1", "SCALE", 2, true), mk("V2", "BINARY", 1, true), mk("V3", "BINARY", 1, true), mk("V4", "BINARY", 1, true)],
  };
  const ev = (a: Record<string, string>): EvaluationDto => ({
    ...evaluation({}),
    checklist: v4,
    results: v4.criteria.map((c) => ({ id: `r-${c.code}`, criterionId: c.id, code: c.code, answer: a[c.code], points: 0, maxPoints: 0, effectiveWeight: 0, explanation: `${c.code} why`, evidenceIdx: [1], checkedFrom: null, checkedTo: null, naReason: null, finalAnswer: a[c.code], finalPoints: 0, finalMaxPoints: 0 })),
  });

  it("maps v4 answers onto the 8 IDs and scores them with official weights", () => {
    const e = entryFor("x", 10, ev({ C1: "yes", C2: "1", C3: "2", C4: "yes", C5: "2", C6: "na", C7: "na", C8: "no", V1: "na", V2: "na", V3: "na", V4: "na" }));
    if (e.status !== "ok") throw new Error("expected ok");
    expect(Object.fromEntries(e.criteria.map((c) => [c.criterion_id, c.value]))).toEqual({
      contact: true, discovery: true, identification: null, consultation: 15, empathy: true, dialogue: 10, closure: false, critical: false,
    });
    // (10 + 15 + 15 + 15 + 15 + 0) / (10 + 15 + 20 + 15 + 15 + 5) = 70 / 80
    expect(e.score).toEqual({ final_score: 87.5, critical_flag: false });
    expect(validateResults({ schema_version: "1.0", team_name: "t", model: { mode: "external_api", name: "m" }, results: [e] }, ["x"])).toEqual([]);
  });

  it("derives dialogue from failures and critical from security or rudeness", () => {
    const e = entryFor("x", 10, ev({ C1: "no", C2: "0", C3: "0", C4: "yes", C5: "0", C6: "no", C7: "na", C8: "no", V1: "1", V2: "no", V3: "yes", V4: "na" }));
    if (e.status !== "ok") throw new Error("expected ok");
    const v = Object.fromEntries(e.criteria.map((c) => [c.criterion_id, c.value]));
    expect(v.dialogue).toBe(4); // C6 and V2 failed; V1 = 1 (some swings) is not a failure
    expect(v.critical).toBe(true); // rude tone (C5 = 0)
    expect(e.score.critical_flag).toBe(true);
  });

  it("uses the voice criteria for calls: V1 swings → dialogue, V4 no reaction → empathy", () => {
    const e = entryFor("x", 10, ev({ C1: "yes", C2: "2", C3: "3", C4: "yes", C5: "2", C6: "na", C7: "na", C8: "yes", V1: "0", V2: "no", V3: "no", V4: "no" }));
    if (e.status !== "ok") throw new Error("expected ok");
    const v = Object.fromEntries(e.criteria.map((c) => [c.criterion_id, c.value]));
    expect(v.dialogue).toBe(0); // V1, V2, V3 failed
    expect(v.empathy).toBe(false); // polite, but V4 = no
    expect(v.critical).toBe(false);
  });
});

describe("v5 (official criteria + voice) export details", () => {
  it("fills missing evidence where the action was expected", () => {
    const ev = evaluation({ contact: "yes", discovery: "na", identification: "na", consultation: "15", empathy: "yes", dialogue: "10", closure: "no", critical: "yes" });
    ev.results.forEach((r) => (r.evidenceIdx = []));
    // turns: 1 client, 2 bot, 3 system, 4 operator, 5 client, 6 operator
    const e = entryFor("demo-001", ["client", "bot", "system", "operator", "client", "operator"], ev);
    if (e.status !== "ok") throw new Error("expected ok");
    const t = Object.fromEntries(e.criteria.map((c) => [c.criterion_id, c.evidence_turns]));
    expect(t).toEqual({ contact: [4], discovery: [1], identification: [1], consultation: [4, 6], empathy: [4, 6], dialogue: [4, 6], closure: [6], critical: [4, 6] });
  });

  it("lowers dialogue and empathy from failed voice criteria on calls", () => {
    const voice = (code: string, answerType: "BINARY" | "SCALE", scaleMax: number) => ({
      id: code, code, title: code, description: "", sectionKey: null, answerType, scaleMin: 0, scaleMax, weight: 5, naAllowed: true, naRule: "", isCritical: false, hints: {}, order: 9,
    });
    const v5: ChecklistDef = { ...checklist, criteria: [...checklist.criteria, voice("V1", "SCALE", 2), voice("V2", "BINARY", 1), voice("V3", "BINARY", 1), voice("V4", "BINARY", 1)] };
    const base = evaluation({ contact: "yes", discovery: "yes", identification: "na", consultation: "20", empathy: "yes", dialogue: "10", closure: "yes", critical: "yes" });
    const answers: Record<string, string> = { V1: "0", V2: "no", V3: "yes", V4: "no" };
    const ev: EvaluationDto = {
      ...base,
      checklist: v5,
      results: [...base.results, ...["V1", "V2", "V3", "V4"].map((code) => ({ ...base.results[0], id: `r-${code}`, criterionId: code, code, answer: answers[code], finalAnswer: answers[code] }))],
    };
    const e = entryFor("x", 10, ev);
    if (e.status !== "ok") throw new Error("expected ok");
    const v = Object.fromEntries(e.criteria.map((c) => [c.criterion_id, c.value]));
    expect(v.dialogue).toBe(4); // two voice failures: 10 → 7 → 4
    expect(v.empathy).toBe(false); // V4 = no
    // (10 + 15 + 20 + 0 + 6 + 5) / (10 + 15 + 20 + 15 + 15 + 5) = 56 / 80 = 70
    expect(e.score.final_score).toBe(70);
  });
});
