// Server-side business operations shared by API routes and the seed script.
import { randomUUID } from "node:crypto";
import { getAudioBundle } from "./audio/metrics";
import { prisma } from "./db";
import { getEvaluator } from "./evaluator";
import { toChecklistDef, toEvaluationDto, type ChecklistRow } from "./mappers";
import type { OrganizerRecord } from "./organizerApi";
import type { ChecklistInput } from "./schemas";
import { scoreChecklist, snapToSteps, validateAnswer } from "./scoring";
import { alignToAudio, toOffsets } from "./time";
import type { Answer, ChecklistDef, ConversationDto, Lang, MessageDto, Speaker } from "./types";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const SPEAKERS = new Set(["client", "operator", "bot", "system"]);
const LANGS = new Set(["RU", "KZ", "EN"]);

// ---------- Conversations ----------

export async function importRecords(groupId: string, records: OrganizerRecord[]) {
  let created = 0;
  let updated = 0;
  for (const r of records) {
    const offsets = toOffsets(r.transcript.map((t) => t.timestamp));
    // Recording positions are only meaningful when the dialog has audio.
    const spans = r.audio_url
      ? alignToAudio(r.transcript.map((t, i) => ({ offsetSec: offsets[i] ?? 0, speaker: t.speaker, text: t.text })))
      : null;
    const exists = await prisma.conversation.findUnique({ where: { id: r.conversation_id }, select: { id: true } });
    const data = {
      groupId,
      channel: r.channel,
      language: LANGS.has(r.language) ? r.language : "RU",
      audioUrl: r.audio_url || null,
      durationSec: offsets.length ? offsets[offsets.length - 1] : 0,
      audioMetrics: null, // recomputed from the (possibly new) recording on the next evaluation
    };
    await prisma.$transaction([
      prisma.message.deleteMany({ where: { conversationId: r.conversation_id } }),
      prisma.conversation.upsert({ where: { id: r.conversation_id }, create: { id: r.conversation_id, ...data }, update: data }),
      prisma.message.createMany({
        data: r.transcript.map((t, idx) => ({
          conversationId: r.conversation_id,
          idx,
          timestamp: t.timestamp,
          offsetSec: offsets[idx] ?? 0,
          speaker: SPEAKERS.has(t.speaker) ? t.speaker : "system",
          text: t.text,
          audioStart: spans?.[idx].audioStart ?? null,
          audioEnd: spans?.[idx].audioEnd ?? null,
        })),
      }),
    ]);
    if (exists) updated++;
    else created++;
  }
  return { groupId, total: records.length, created, updated };
}

export async function loadConversation(id: string): Promise<{ conversation: ConversationDto; messages: MessageDto[] }> {
  const c = await prisma.conversation.findUnique({ where: { id }, include: { messages: { orderBy: { idx: "asc" } } } });
  if (!c) throw new HttpError(404, `Conversation ${id} not found`);
  return {
    conversation: { id: c.id, groupId: c.groupId, channel: c.channel, language: c.language as Lang, audioUrl: c.audioUrl, durationSec: c.durationSec },
    messages: c.messages.map((m) => ({
      idx: m.idx,
      timestamp: m.timestamp,
      offsetSec: m.offsetSec,
      speaker: m.speaker as Speaker,
      text: m.text,
      audioStart: m.audioStart,
      audioEnd: m.audioEnd,
    })),
  };
}

// ---------- Checklists ----------

const checklistInclude = { sections: true, criteria: true } as const;

export async function getChecklist(id: string): Promise<ChecklistDef> {
  const row = await prisma.checklist.findUnique({ where: { id }, include: checklistInclude });
  if (!row) throw new HttpError(404, `Checklist ${id} not found`);
  return toChecklistDef(row as ChecklistRow);
}

export async function getActiveChecklist(): Promise<ChecklistDef | null> {
  const row =
    (await prisma.checklist.findFirst({ where: { isActive: true }, include: checklistInclude, orderBy: { createdAt: "desc" } })) ??
    (await prisma.checklist.findFirst({ include: checklistInclude, orderBy: { createdAt: "desc" } }));
  return row ? toChecklistDef(row as ChecklistRow) : null;
}

/** Creates a checklist (new family) or a new version of an existing family. Versions are immutable. */
export async function saveChecklistVersion(input: ChecklistInput, family?: string, activate = true): Promise<ChecklistDef> {
  const fam = family ?? randomUUID();
  const latest = await prisma.checklist.findFirst({ where: { family: fam }, orderBy: { version: "desc" } });
  const version = (latest?.version ?? 0) + 1;

  const row = await prisma.$transaction(async (tx) => {
    if (activate) await tx.checklist.updateMany({ where: { isActive: true }, data: { isActive: false } });
    const cl = await tx.checklist.create({
      data: {
        family: fam,
        name: input.name,
        version,
        isActive: activate,
        decimals: input.decimals,
        roundingMode: input.roundingMode,
        criticalPolicy: input.criticalPolicy,
      },
    });
    const sectionIds = new Map<string, string>();
    for (const [order, s] of input.sections.entries()) {
      const sec = await tx.section.create({ data: { checklistId: cl.id, key: s.key, name: s.name, order } });
      sectionIds.set(s.key, sec.id);
    }
    await tx.criterion.createMany({
      data: input.criteria.map((c, order) => ({
        checklistId: cl.id,
        sectionId: c.sectionKey ? sectionIds.get(c.sectionKey) ?? null : null,
        code: c.code,
        title: c.title,
        description: c.description,
        answerType: c.answerType,
        scaleMin: c.answerType === "BINARY" ? 0 : c.scaleMin,
        scaleMax: c.answerType === "BINARY" ? 1 : c.scaleMax,
        weight: c.weight,
        naAllowed: c.naAllowed,
        naRule: c.naRule,
        isCritical: c.isCritical,
        hints: JSON.stringify(c.hints ?? {}),
        order,
      })),
    });
    return tx.checklist.findUniqueOrThrow({ where: { id: cl.id }, include: checklistInclude });
  });
  return toChecklistDef(row as ChecklistRow);
}

export async function activateChecklist(id: string) {
  await getChecklist(id);
  await prisma.$transaction([
    prisma.checklist.updateMany({ where: { isActive: true }, data: { isActive: false } }),
    prisma.checklist.update({ where: { id }, data: { isActive: true } }),
  ]);
}

// ---------- Evaluations ----------

const evaluationInclude = { results: true, appeals: true } as const;

export async function evaluateConversation(conversationId: string, checklistId?: string) {
  const checklist = checklistId ? await getChecklist(checklistId) : await getActiveChecklist();
  if (!checklist) throw new HttpError(400, "No checklist exists yet");
  const { conversation, messages } = await loadConversation(conversationId);
  const evaluator = getEvaluator();
  // Calls: measure the voice from the recording (cached); chats have no audio.
  const audio = conversation.audioUrl ? await getAudioBundle(conversation, messages, Boolean(evaluator.wantsAudioBytes)) : null;
  const verdicts = await evaluator.evaluate({ conversation, messages, checklist, audio });

  const answers: Record<string, Answer> = {};
  for (const v of verdicts) {
    const c = checklist.criteria.find((x) => x.id === v.criterionId);
    if (!c) continue;
    try {
      const a = snapToSteps(c, v.answer); // e.g. consultation 12 → 10 on a 0/5/10/15/20 scale
      validateAnswer(c, a);
      answers[c.id] = a;
    } catch {
      answers[c.id] = c.answerType === "BINARY" ? "no" : String(c.scaleMin);
    }
  }
  const score = scoreChecklist(checklist, answers);

  const row = await prisma.evaluation.create({
    data: {
      conversationId,
      checklistId: checklist.id,
      checklistSnapshot: JSON.stringify(checklist),
      // Which model(s) actually produced the verdicts (an evaluator may report its route, e.g. after a failover).
      evaluator: (verdicts as { route?: string }).route ? `${evaluator.name}:${(verdicts as { route?: string }).route}` : evaluator.name,
      originalTotal: score.total,
      finalTotal: score.total,
      hasCriticalError: score.hasCriticalError,
      finalCritical: score.hasCriticalError,
      sectionScores: JSON.stringify(score.sections),
      finalSections: JSON.stringify(score.sections),
      results: {
        create: checklist.criteria.map((c) => {
          const v = verdicts.find((x) => x.criterionId === c.id);
          const s = score.criteria.find((x) => x.criterionId === c.id)!;
          return {
            criterionId: c.id,
            code: c.code,
            answer: s.answer,
            points: s.points,
            maxPoints: s.maxPoints,
            effectiveWeight: s.effectiveWeight,
            explanation: v?.explanation ?? "",
            evidenceIdx: JSON.stringify(v?.evidenceIdx ?? []),
            checkedFrom: v?.checkedRange?.from ?? null,
            checkedTo: v?.checkedRange?.to ?? null,
            naReason: s.answer === "na" ? v?.naReason ?? null : null,
            finalAnswer: s.answer,
            finalPoints: s.points,
            finalMaxPoints: s.maxPoints,
          };
        }),
      },
    },
    include: evaluationInclude,
  });
  return toEvaluationDto(row);
}

export async function getEvaluation(id: string) {
  const row = await prisma.evaluation.findUnique({ where: { id }, include: evaluationInclude });
  if (!row) throw new HttpError(404, `Evaluation ${id} not found`);
  return toEvaluationDto(row);
}

// ---------- Appeals ----------

export async function createAppeal(criterionResultId: string, comment: string) {
  const r = await prisma.criterionResult.findUnique({ where: { id: criterionResultId }, include: { appeals: true } });
  if (!r) throw new HttpError(404, "Criterion result not found");
  if (r.appeals.some((a) => a.status === "OPEN")) throw new HttpError(409, "An open appeal already exists for this criterion");
  return prisma.appeal.create({
    data: { evaluationId: r.evaluationId, criterionResultId: r.id, comment, previousAnswer: r.finalAnswer },
  });
}

/** Reviewer decision: confirm keeps the score; change sets a new answer and re-scores the evaluation. */
export async function decideAppeal(appealId: string, action: "confirm" | "change", reason: string, newAnswer?: string) {
  const appeal = await prisma.appeal.findUnique({ where: { id: appealId } });
  if (!appeal) throw new HttpError(404, "Appeal not found");
  if (appeal.status !== "OPEN") throw new HttpError(409, "This appeal has already been decided");
  const evaluation = await prisma.evaluation.findUniqueOrThrow({ where: { id: appeal.evaluationId }, include: evaluationInclude });
  const dto = toEvaluationDto(evaluation);
  const target = evaluation.results.find((r) => r.id === appeal.criterionResultId)!;
  const criterion = dto.checklist.criteria.find((c) => c.id === target.criterionId);
  if (!criterion) throw new HttpError(500, "Criterion is missing from the checklist snapshot");

  const totalBefore = evaluation.finalTotal;
  if (action === "confirm") {
    return prisma.appeal.update({
      where: { id: appealId },
      data: { status: "CONFIRMED", reviewerReason: reason, newAnswer: target.finalAnswer, totalBefore, totalAfter: totalBefore, decidedAt: new Date() },
    });
  }

  if (newAnswer === undefined) throw new HttpError(400, "newAnswer is required to change the score");
  try {
    validateAnswer(criterion, newAnswer);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }

  const answers: Record<string, Answer> = {};
  for (const r of evaluation.results) answers[r.criterionId] = r.id === target.id ? newAnswer : r.finalAnswer;
  const score = scoreChecklist(dto.checklist, answers);

  const [updatedAppeal] = await prisma.$transaction([
    prisma.appeal.update({
      where: { id: appealId },
      data: { status: "CHANGED", reviewerReason: reason, newAnswer, totalBefore, totalAfter: score.total, decidedAt: new Date() },
    }),
    ...evaluation.results.map((r) => {
      const s = score.criteria.find((x) => x.criterionId === r.criterionId)!;
      return prisma.criterionResult.update({
        where: { id: r.id },
        data: { finalAnswer: s.answer, finalPoints: s.points, finalMaxPoints: s.maxPoints },
      });
    }),
    prisma.evaluation.update({
      where: { id: evaluation.id },
      data: { finalTotal: score.total, finalCritical: score.hasCriticalError, finalSections: JSON.stringify(score.sections) },
    }),
  ]);
  return updatedAppeal;
}
