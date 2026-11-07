// Converts Prisma rows (with JSON stored as strings) to API DTOs.
import type { Appeal, Checklist, Criterion, CriterionResult, Evaluation, Section } from "@prisma/client";
import type {
  AppealDto,
  ChecklistDef,
  CriterionDef,
  CriterionHints,
  CriterionResultDto,
  CriticalPolicy,
  EvaluationDto,
  RoundingMode,
  SectionScore,
} from "./types";

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export type ChecklistRow = Checklist & { sections: Section[]; criteria: Criterion[] };

export function toChecklistDef(row: ChecklistRow): ChecklistDef {
  const keyById = new Map(row.sections.map((s) => [s.id, s.key]));
  return {
    id: row.id,
    family: row.family,
    name: row.name,
    version: row.version,
    isActive: row.isActive,
    decimals: row.decimals,
    roundingMode: row.roundingMode as RoundingMode,
    criticalPolicy: row.criticalPolicy as CriticalPolicy,
    createdAt: row.createdAt.toISOString(),
    sections: [...row.sections].sort((a, b) => a.order - b.order).map((s) => ({ key: s.key, name: s.name, order: s.order })),
    criteria: [...row.criteria]
      .sort((a, b) => a.order - b.order)
      .map(
        (c): CriterionDef => ({
          id: c.id,
          code: c.code,
          title: c.title,
          description: c.description,
          sectionKey: c.sectionId ? keyById.get(c.sectionId) ?? null : null,
          answerType: c.answerType as CriterionDef["answerType"],
          scaleMin: c.scaleMin,
          scaleMax: c.scaleMax,
          weight: c.weight,
          naAllowed: c.naAllowed,
          naRule: c.naRule,
          isCritical: c.isCritical,
          hints: parseJson<CriterionHints>(c.hints, {}),
          order: c.order,
        }),
      ),
  };
}

export function toResultDto(r: CriterionResult): CriterionResultDto {
  return {
    id: r.id,
    criterionId: r.criterionId,
    code: r.code,
    answer: r.answer,
    points: r.points,
    maxPoints: r.maxPoints,
    effectiveWeight: r.effectiveWeight,
    explanation: r.explanation,
    evidenceIdx: parseJson<number[]>(r.evidenceIdx, []),
    checkedFrom: r.checkedFrom,
    checkedTo: r.checkedTo,
    naReason: r.naReason,
    finalAnswer: r.finalAnswer,
    finalPoints: r.finalPoints,
    finalMaxPoints: r.finalMaxPoints,
  };
}

export function toAppealDto(a: Appeal): AppealDto {
  return {
    id: a.id,
    evaluationId: a.evaluationId,
    criterionResultId: a.criterionResultId,
    comment: a.comment,
    status: a.status as AppealDto["status"],
    previousAnswer: a.previousAnswer,
    newAnswer: a.newAnswer,
    reviewerReason: a.reviewerReason,
    totalBefore: a.totalBefore,
    totalAfter: a.totalAfter,
    createdAt: a.createdAt.toISOString(),
    decidedAt: a.decidedAt?.toISOString() ?? null,
  };
}

export type EvaluationRow = Evaluation & { results: CriterionResult[]; appeals: Appeal[] };

export function toEvaluationDto(e: EvaluationRow): EvaluationDto {
  const checklist = parseJson<ChecklistDef>(e.checklistSnapshot, {} as ChecklistDef);
  const order = new Map(checklist.criteria?.map((c) => [c.id, c.order]) ?? []);
  return {
    id: e.id,
    conversationId: e.conversationId,
    checklistId: e.checklistId,
    checklist,
    evaluator: e.evaluator,
    originalTotal: e.originalTotal,
    finalTotal: e.finalTotal,
    hasCriticalError: e.hasCriticalError,
    finalCritical: e.finalCritical,
    sectionScores: parseJson<SectionScore[]>(e.sectionScores, []),
    finalSections: parseJson<SectionScore[]>(e.finalSections, []),
    createdAt: e.createdAt.toISOString(),
    results: [...e.results].sort((a, b) => (order.get(a.criterionId) ?? 0) - (order.get(b.criterionId) ?? 0)).map(toResultDto),
    appeals: [...e.appeals].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(toAppealDto),
  };
}
