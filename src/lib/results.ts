// Builds results.json in the organizers' format (CQA_Student_Guide_Appendix_Results.pdf, schema 1.0)
// from evaluations stored in the database, and validates it.
import { pickLocalized } from "./localized";
import { OFFICIAL_CODES, type OfficialCode } from "./officialChecklist";
import { round, scoreChecklist } from "./scoring";
import type { Answer, ChecklistDef, EvaluationDto } from "./types";

export type ResultValue = boolean | number | null;

export interface ResultCriterion {
  criterion_id: OfficialCode;
  value: ResultValue;
  rationale: string;
  evidence_turns: number[];
}

export type ResultEntry =
  | { conversation_id: string; status: "ok"; criteria: ResultCriterion[]; score: { final_score: number; critical_flag: boolean } }
  | { conversation_id: string; status: "error"; criteria: []; score: null; error: string };

export interface ResultsFile {
  schema_version: "1.0";
  team_name: string;
  model: { mode: "local" | "external_api" | "hybrid"; name: string };
  results: ResultEntry[];
}

/** Allowed value types per criterion (appendix, page 3). */
const VALUE_RULES: Record<OfficialCode, { kind: "bool" | "num"; nullable: boolean; steps?: number[] }> = {
  contact: { kind: "bool", nullable: false },
  discovery: { kind: "bool", nullable: true },
  identification: { kind: "bool", nullable: true },
  consultation: { kind: "num", nullable: true, steps: [0, 5, 10, 15, 20] },
  empathy: { kind: "bool", nullable: false },
  dialogue: { kind: "num", nullable: false, steps: [0, 4, 7, 10] },
  closure: { kind: "bool", nullable: true },
  critical: { kind: "bool", nullable: false },
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Maps a stored answer to the results.json value. The "critical" criterion is stored inverted (yes = no violation). */
export function toResultValue(code: OfficialCode, answer: Answer): ResultValue {
  if (code === "critical") return answer === "no";
  if (answer === "na") return null;
  if (VALUE_RULES[code].kind === "num") return Number(answer);
  return answer === "yes";
}

/** One results.json entry from an evaluation (uses final answers, i.e. after any appeal decisions). */
export function buildEntry(conversationId: string, turnCount: number, ev: EvaluationDto): ResultEntry {
  const checklist = ev.checklist;
  const byCode = new Map(checklist.criteria.map((c) => [c.code, c]));
  const missing = OFFICIAL_CODES.filter((code) => !byCode.has(code));
  if (missing.length) throw new Error(`Evaluation ${ev.id} does not use the official checklist (missing: ${missing.join(", ")})`);

  const criteria: ResultCriterion[] = OFFICIAL_CODES.map((code) => {
    const c = byCode.get(code)!;
    const r = ev.results.find((x) => x.criterionId === c.id);
    if (!r) throw new Error(`Evaluation ${ev.id} has no result for ${code}`);
    const answer = r.finalAnswer;
    // 1-based turn numbers over the original transcript (client, bot and system events included).
    let turns = r.evidenceIdx.map((i) => i + 1);
    if (!turns.length && r.checkedFrom !== null && r.checkedTo !== null) turns = [r.checkedFrom + 1, r.checkedTo + 1];
    turns = [...new Set(turns)].filter((n) => Number.isInteger(n) && n >= 1 && n <= turnCount).sort((a, b) => a - b);
    const appeal = ev.appeals.filter((a) => a.criterionResultId === r.id && a.status === "CHANGED").at(-1);
    const why = answer === "na" ? pickLocalized(r.naReason, "RU") || pickLocalized(r.explanation, "RU") : pickLocalized(r.explanation, "RU");
    const rationale = clean(appeal?.reviewerReason ? `${why} Решение по апелляции: ${appeal.reviewerReason}` : why) || c.title;
    return { criterion_id: code, value: toResultValue(code, answer), rationale, evidence_turns: turns };
  });

  // Recompute the total with the scoring engine from the exported answers (weights, N/A redistribution, 2 decimals).
  const answers: Record<string, Answer> = {};
  for (const c of checklist.criteria) answers[c.id] = ev.results.find((x) => x.criterionId === c.id)?.finalAnswer ?? "na";
  const official: ChecklistDef = { ...checklist, decimals: 2, roundingMode: "half-up", criticalPolicy: "flag", criteria: checklist.criteria.filter((c) => (OFFICIAL_CODES as readonly string[]).includes(c.code)) };
  const score = scoreChecklist(official, answers);
  const critical = criteria.find((x) => x.criterion_id === "critical")!.value === true;
  return {
    conversation_id: conversationId,
    status: "ok",
    criteria,
    score: { final_score: round(score.rawTotal, 2), critical_flag: critical },
  };
}

// ---------- Team checklist v4 → the 8 official IDs ----------
// v4 ("Базовый чек-лист CQA": C1–C8 + voice V1–V4) is mapped deterministically; the source criterion is named in each rationale.

/** Official weights (appendix, page 3); "critical" carries no points. */
const OFFICIAL_WEIGHTS: Record<OfficialCode, number> = { contact: 10, discovery: 15, identification: 20, consultation: 20, empathy: 15, dialogue: 15, closure: 5, critical: 0 };

/** True when the checklist looks like the team checklist v4 (C1–C8 codes). */
export function isTeamV4(checklist: ChecklistDef): boolean {
  return ["C1", "C2", "C3", "C4", "C5", "C6", "C8"].every((code) => checklist.criteria.some((c) => c.code === code));
}

/** final_score from the 8 values: N/A (null) excluded, weights redistributed, scales proportional, 2 decimals. */
export function officialScore(values: Record<OfficialCode, ResultValue>): number {
  let got = 0;
  let max = 0;
  for (const code of OFFICIAL_CODES) {
    const w = OFFICIAL_WEIGHTS[code];
    const v = values[code];
    if (!w || v === null) continue;
    const top = code === "consultation" ? 20 : code === "dialogue" ? 10 : 1;
    got += w * (typeof v === "number" ? v / top : v ? 1 : 0);
    max += w;
  }
  return max > 0 ? round((got / max) * 100, 2) : 0;
}

export function buildEntryFromV4(conversationId: string, turnCount: number, ev: EvaluationDto): ResultEntry {
  const cl = ev.checklist;
  const get = (code: string) => {
    const c = cl.criteria.find((x) => x.code === code);
    const r = c ? ev.results.find((x) => x.criterionId === c.id) : undefined;
    if (!c || !r) return null;
    const answer = r.finalAnswer;
    const level = answer === "na" ? null : c.answerType === "BINARY" ? (answer === "yes" ? 1 : 0) : (Number(answer) - c.scaleMin) / (c.scaleMax - c.scaleMin || 1);
    const why = answer === "na" ? pickLocalized(r.naReason, "RU") || pickLocalized(r.explanation, "RU") : pickLocalized(r.explanation, "RU");
    let turns = r.evidenceIdx.map((i) => i + 1);
    if (!turns.length && r.checkedFrom !== null && r.checkedTo !== null) turns = [r.checkedFrom + 1, r.checkedTo + 1];
    return { code, title: c.title, answer, level, why: clean(why), turns };
  };
  const src = (x: NonNullable<ReturnType<typeof get>>) => `[v4 ${x.code} «${x.title}»: ${x.answer === "na" ? "N/A" : x.answer}] ${x.why}`;
  const tidy = (t: number[]) => [...new Set(t)].filter((n) => Number.isInteger(n) && n >= 1 && n <= turnCount).sort((a, b) => a - b);
  const need = (code: string) => {
    const x = get(code);
    if (!x) throw new Error(`Checklist v4 has no criterion ${code}`);
    return x;
  };

  const C1 = need("C1"), C2 = need("C2"), C3 = need("C3"), C4 = need("C4"), C5 = need("C5"), C6 = need("C6"), C8 = need("C8");
  // Voice criteria (calls only; N/A for chats): V1 steady voice, V2 no interrupting, V3 pace and pauses → dialogue;
  // V4 calm tone and reaction to the client's emotion → empathy.
  const V1 = get("V1"), V2 = get("V2"), V3 = get("V3"), V4 = get("V4");
  type Src = NonNullable<ReturnType<typeof get>>;
  const applicable = (x: Src | null): x is Src => Boolean(x) && x!.level !== null;
  // A check fails when it is not met; for the 0–2 steady-voice scale only 0 (strong pitch swings) is a failure.
  const failed = (x: Src) => (x.code === "V1" ? x.level! === 0 : x.level! < 1);

  // dialogue (0/4/7/10): count failures among wait warning (C6) and, for calls, V1, V2, V3.
  const dialogueParts = [C6, V1, V2, V3].filter(applicable);
  const failures = dialogueParts.filter(failed).length;
  const dialogueValue = [10, 7, 4, 0][Math.min(3, failures)];
  const consultationValue = C3.level === null ? null : [0, 5, 10, 15, 20].reduce((best, s) => (Math.abs(s - C3.level! * 20) < Math.abs(best - C3.level! * 20) ? s : best), 0);
  const rude = C5.level !== null && C5.level === 0;
  const politeOk = C5.level === null ? false : C5.level >= 0.5;
  const v4Failed = applicable(V4) && V4.level! < 1;
  const critical = C4.level === 0 || rude;

  const criteria: ResultCriterion[] = [
    { criterion_id: "contact", value: C1.level === null ? false : C1.level >= 1, rationale: src(C1), evidence_turns: tidy(C1.turns) },
    { criterion_id: "discovery", value: C2.level === null ? null : C2.level >= 0.5, rationale: `${src(C2)} (правило: ≥ 1 из 2 → «Да»)`, evidence_turns: tidy(C2.turns) },
    {
      criterion_id: "identification",
      value: null,
      rationale: "В чек-листе v4 нет критерия идентификации, поэтому оценка не выставляется (N/A).",
      evidence_turns: [],
    },
    { criterion_id: "consultation", value: consultationValue, rationale: `${src(C3)} (шкала 0–3 пересчитана в 0/5/10/15/20)`, evidence_turns: tidy(C3.turns) },
    {
      criterion_id: "empathy",
      value: politeOk && !v4Failed,
      rationale: `${src(C5)} (правило: ≥ 1 из 2 → «Да»)${applicable(V4) ? ` ${src(V4)}${v4Failed ? " — оператор не отреагировал на эмоцию клиента, поэтому «Нет»." : ""}` : ""}`,
      evidence_turns: tidy([...C5.turns, ...(applicable(V4) ? V4.turns : [])]),
    },
    {
      criterion_id: "dialogue",
      value: dialogueValue,
      rationale: `Сбоев в ведении диалога: ${failures} из ${dialogueParts.length} проверок (0 → 10, 1 → 7, 2 → 4, 3 → 0). ${dialogueParts.map(src).join(" ")}`,
      evidence_turns: tidy(dialogueParts.flatMap((x) => (failed(x) ? x.turns : []))),
    },
    { criterion_id: "closure", value: C8.level === null ? null : C8.level >= 1, rationale: src(C8), evidence_turns: tidy(C8.turns) },
    {
      criterion_id: "critical",
      value: critical,
      rationale: critical
        ? `${C4.level === 0 ? src(C4) : ""} ${rude ? `${src(C5)} (грубый тон расценён как оскорбление клиента)` : ""}`.trim()
        : `Грубых нарушений нет. ${src(C4)}`,
      evidence_turns: tidy([...(C4.level === 0 ? C4.turns : []), ...(rude ? C5.turns : []), ...(critical ? [] : C4.turns)]),
    },
  ];
  const values = Object.fromEntries(criteria.map((c) => [c.criterion_id, c.value])) as Record<OfficialCode, ResultValue>;
  return { conversation_id: conversationId, status: "ok", criteria, score: { final_score: officialScore(values), critical_flag: critical } };
}

/** Builds the entry from whichever checklist the evaluation used (official codes, or team checklist v4). */
export function entryFor(conversationId: string, turnCount: number, ev: EvaluationDto): ResultEntry {
  return isTeamV4(ev.checklist) ? buildEntryFromV4(conversationId, turnCount, ev) : buildEntry(conversationId, turnCount, ev);
}

export function errorEntry(conversationId: string, error: string): ResultEntry {
  return { conversation_id: conversationId, status: "error", criteria: [], score: null, error: clean(error).slice(0, 500) };
}

/** Describes the model(s) from the stored evaluator routes, e.g. "two-stage-ai-v1:groq:openai/gpt-oss-120b". */
export function describeModels(routes: string[]): ResultsFile["model"] {
  const names = new Set<string>();
  let local = false;
  let external = false;
  for (const r of routes) {
    for (const m of r.matchAll(/(groq|gemini):([^+()]+)/g)) {
      names.add(m[1] === "groq" ? `${m[2]} (Groq)` : `${m[2]} (Google Gemini)`);
      external = true;
    }
    if (r.includes("gemini:")) {
      names.add("in-app acoustic voice metrics (local)");
      local = true;
    }
    if (r.includes("heuristic") || r.startsWith("mock")) {
      names.add("mock-heuristic-v1 (local rules)");
      local = true;
    }
  }
  return { mode: local && external ? "hybrid" : external ? "external_api" : "local", name: [...names].join(", ") || "unknown" };
}

/** Validates a results file against the appendix rules. Returns a list of problems (empty = valid). */
export function validateResults(file: ResultsFile, expectedIds?: string[], expectedCount?: number): string[] {
  const errs: string[] = [];
  if (file.schema_version !== "1.0") errs.push("schema_version must be \"1.0\"");
  if (!file.team_name?.trim()) errs.push("team_name is empty");
  if (!["local", "external_api", "hybrid"].includes(file.model?.mode)) errs.push("model.mode must be local, external_api or hybrid");
  if (!file.model?.name?.trim()) errs.push("model.name is empty");
  const seen = new Set<string>();
  for (const e of file.results) {
    const id = e.conversation_id;
    if (seen.has(id)) errs.push(`${id}: duplicate conversation_id`);
    seen.add(id);
    if (e.status === "error") {
      if (e.criteria.length || e.score !== null || !e.error) errs.push(`${id}: error entries need criteria [], score null and an error message`);
      continue;
    }
    const codes = e.criteria.map((c) => c.criterion_id);
    if (codes.length !== 8 || OFFICIAL_CODES.some((c) => codes.filter((x) => x === c).length !== 1)) errs.push(`${id}: needs each of the 8 criteria exactly once`);
    for (const c of e.criteria) {
      const rule = VALUE_RULES[c.criterion_id];
      if (!rule) {
        errs.push(`${id}: unknown criterion ${c.criterion_id}`);
        continue;
      }
      const v = c.value;
      const ok = v === null ? rule.nullable : rule.kind === "bool" ? typeof v === "boolean" : typeof v === "number" && (rule.steps ?? []).includes(v);
      if (!ok) errs.push(`${id}: ${c.criterion_id} has invalid value ${JSON.stringify(v)}`);
      if (!c.rationale?.trim()) errs.push(`${id}: ${c.criterion_id} has no rationale`);
      if (!Array.isArray(c.evidence_turns) || c.evidence_turns.some((n) => !Number.isInteger(n) || n < 1)) errs.push(`${id}: ${c.criterion_id} has invalid evidence_turns`);
    }
    const s = e.score;
    if (typeof s.final_score !== "number" || s.final_score < 0 || s.final_score > 100 || Math.round(s.final_score * 100) !== s.final_score * 100)
      errs.push(`${id}: final_score must be 0–100 with at most two decimals`);
    const crit = e.criteria.find((c) => c.criterion_id === "critical")?.value;
    if (s.critical_flag !== crit) errs.push(`${id}: critical_flag must equal the critical criterion value`);
  }
  if (expectedIds) {
    for (const id of expectedIds) if (!seen.has(id)) errs.push(`${id}: missing from results`);
    for (const id of seen) if (!expectedIds.includes(id)) errs.push(`${id}: not in the source dataset`);
  }
  if (expectedCount !== undefined && file.results.length !== expectedCount) errs.push(`expected exactly ${expectedCount} records, found ${file.results.length}`);
  return errs;
}
