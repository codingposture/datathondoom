// Pure scoring engine: weights, N/A redistribution, scales, sections, critical errors, rounding.
import type {
  Answer,
  ChecklistDef,
  CriterionDef,
  RoundingMode,
  ScoreResult,
  ScoredCriterion,
  SectionScore,
} from "./types";

export function round(value: number, decimals: number, mode: RoundingMode = "half-up"): number {
  const f = 10 ** decimals;
  // Small epsilon protects against binary artefacts like 85.45 -> 85.4499999.
  const x = value * f;
  const eps = 1e-9 * Math.max(1, Math.abs(x));
  let r: number;
  if (mode === "floor") r = Math.floor(x + eps);
  else if (mode === "ceil") r = Math.ceil(x - eps);
  else r = Math.sign(x) * Math.floor(Math.abs(x) + 0.5 + eps);
  return r / f;
}

export function isNA(answer: Answer): boolean {
  return answer === "na";
}

/** Normalizes an answer to [0, 1]. Returns null for N/A. */
export function normalize(c: Pick<CriterionDef, "answerType" | "scaleMin" | "scaleMax">, answer: Answer): number | null {
  if (isNA(answer)) return null;
  if (c.answerType === "BINARY") return answer === "yes" ? 1 : 0;
  const v = Number(answer);
  if (!Number.isFinite(v)) return 0;
  const span = c.scaleMax - c.scaleMin;
  if (span <= 0) return v >= c.scaleMax ? 1 : 0;
  return Math.min(1, Math.max(0, (v - c.scaleMin) / span));
}

/** Validates an answer for a criterion, throws on invalid input. */
export function validateAnswer(c: CriterionDef, answer: Answer): void {
  if (answer === "na") {
    if (!c.naAllowed) throw new Error(`N/A is not allowed for ${c.code}`);
    return;
  }
  if (c.answerType === "BINARY") {
    if (answer !== "yes" && answer !== "no") throw new Error(`Answer for ${c.code} must be yes/no`);
    return;
  }
  const v = Number(answer);
  if (!Number.isInteger(v) || v < c.scaleMin || v > c.scaleMax) {
    throw new Error(`Answer for ${c.code} must be an integer in ${c.scaleMin}..${c.scaleMax}`);
  }
  const steps = c.hints?.steps;
  if (steps?.length && !steps.includes(v)) throw new Error(`Answer for ${c.code} must be one of ${steps.join(", ")}`);
}

/** Allowed answers of a SCALE criterion, low to high. */
export function scaleValues(c: Pick<CriterionDef, "scaleMin" | "scaleMax" | "hints">): number[] {
  const steps = c.hints?.steps;
  if (steps?.length) return [...steps].sort((a, b) => a - b);
  return Array.from({ length: c.scaleMax - c.scaleMin + 1 }, (_, i) => c.scaleMin + i);
}

/** Snaps a numeric SCALE answer to the nearest allowed step (ties go down). Other answers are returned unchanged. */
export function snapToSteps(c: CriterionDef, answer: Answer): Answer {
  if (c.answerType !== "SCALE" || answer === "na" || !c.hints?.steps?.length) return answer;
  const v = Number(answer);
  if (!Number.isFinite(v)) return answer;
  const steps = scaleValues(c);
  let best = steps[0];
  for (const s of steps) if (Math.abs(s - v) < Math.abs(best - v)) best = s;
  return String(best);
}

/** Is this answer a failure of a critical criterion? */
export function isCriticalFailure(c: CriterionDef, answer: Answer): boolean {
  if (!c.isCritical || isNA(answer)) return false;
  const n = normalize(c, answer);
  return n !== null && n < 1;
}

/**
 * Scores a checklist given answers keyed by criterion id.
 * Total is out of 100: each applicable criterion's effective weight is w / Σw(applicable) × 100.
 */
export function scoreChecklist(checklist: ChecklistDef, answers: Record<string, Answer>): ScoreResult {
  const { decimals, roundingMode } = checklist;
  const criteria = [...checklist.criteria].sort((a, b) => a.order - b.order);
  const applicableWeight = criteria.reduce((s, c) => {
    const a = answers[c.id] ?? "na";
    return isNA(a) ? s : s + Math.max(0, c.weight);
  }, 0);

  const scored: ScoredCriterion[] = criteria.map((c) => {
    const answer = answers[c.id] ?? "na";
    const n = normalize(c, answer);
    if (n === null || applicableWeight === 0) {
      return { criterionId: c.id, answer, points: 0, maxPoints: 0, effectiveWeight: 0, failedCritical: false };
    }
    const eff = (Math.max(0, c.weight) / applicableWeight) * 100;
    return {
      criterionId: c.id,
      answer,
      points: round(eff * n, decimals, roundingMode),
      maxPoints: round(eff, decimals, roundingMode),
      effectiveWeight: eff,
      failedCritical: isCriticalFailure(c, answer),
    };
  });

  // Totals are computed from unrounded values, then rounded once (avoids accumulated rounding error).
  const rawTotal = criteria.reduce((s, c) => {
    const n = normalize(c, answers[c.id] ?? "na");
    return n === null || applicableWeight === 0 ? s : s + (Math.max(0, c.weight) / applicableWeight) * 100 * n;
  }, 0);
  const hasCriticalError = scored.some((s) => s.failedCritical);
  const total =
    hasCriticalError && checklist.criticalPolicy === "zero-total" ? 0 : round(rawTotal, decimals, roundingMode);

  const sections: SectionScore[] = [...checklist.sections]
    .sort((a, b) => a.order - b.order)
    .map((sec) => {
      const inSec = criteria.filter((c) => c.sectionKey === sec.key);
      let raw = 0;
      let max = 0;
      for (const c of inSec) {
        const n = normalize(c, answers[c.id] ?? "na");
        if (n === null || applicableWeight === 0) continue;
        const eff = (Math.max(0, c.weight) / applicableWeight) * 100;
        raw += eff * n;
        max += eff;
      }
      return {
        key: sec.key,
        name: sec.name,
        points: round(raw, decimals, roundingMode),
        maxPoints: round(max, decimals, roundingMode),
        percent: max > 0 ? round((raw / max) * 100, decimals, roundingMode) : null,
      };
    });

  return { total, rawTotal, hasCriticalError, criteria: scored, sections };
}
