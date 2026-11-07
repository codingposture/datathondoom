import { handle, type Params } from "@/lib/api";
import { prisma } from "@/lib/db";
import { toAppealDto } from "@/lib/mappers";
import { getEvaluation, HttpError, loadConversation } from "@/lib/services";

/** Reviewer view: the disputed result, the comment, the transcript fragment and the evaluation. */
export const GET = handle(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const appeal = await prisma.appeal.findUnique({ where: { id }, include: { criterionResult: true } });
  if (!appeal) throw new HttpError(404, "Appeal not found");
  const evaluation = await getEvaluation(appeal.evaluationId);
  const { conversation, messages } = await loadConversation(evaluation.conversationId);
  const result = evaluation.results.find((r) => r.id === appeal.criterionResultId)!;
  const criterion = evaluation.checklist.criteria.find((c) => c.id === result.criterionId) ?? null;

  const anchors = result.evidenceIdx.length
    ? result.evidenceIdx
    : [result.checkedFrom, result.checkedTo].filter((x): x is number => x !== null);
  const lo = anchors.length ? Math.max(0, Math.min(...anchors) - 3) : 0;
  const hi = anchors.length ? Math.min(messages.length - 1, Math.max(...anchors) + 3) : Math.min(messages.length - 1, 8);
  return {
    appeal: toAppealDto(appeal),
    result,
    criterion,
    evaluation,
    conversation: { ...conversation, audioUrl: conversation.audioUrl ? `/api/audio/${encodeURIComponent(conversation.id)}` : null },
    fragment: messages.slice(lo, hi + 1),
  };
});
