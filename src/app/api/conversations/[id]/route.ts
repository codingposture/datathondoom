import { handle, type Params } from "@/lib/api";
import { prisma } from "@/lib/db";
import { toEvaluationDto } from "@/lib/mappers";
import { loadConversation } from "@/lib/services";

export const GET = handle(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const { conversation, messages } = await loadConversation(id);
  const evaluations = await prisma.evaluation.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "desc" },
    include: { results: true, appeals: true },
  });
  return {
    conversation: {
      ...conversation,
      audioUrl: conversation.audioUrl ? `/api/audio/${encodeURIComponent(id)}` : null,
      playerUrl: conversation.audioUrl,
    },
    messages,
    evaluation: evaluations[0] ? toEvaluationDto(evaluations[0]) : null,
    history: evaluations.map((e) => ({ id: e.id, checklistId: e.checklistId, finalTotal: e.finalTotal, createdAt: e.createdAt.toISOString() })),
  };
});
