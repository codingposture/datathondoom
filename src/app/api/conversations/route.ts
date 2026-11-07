import { handle } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const where: Record<string, unknown> = {};
  if (q.get("groupId")) where.groupId = q.get("groupId");
  if (q.get("language")) where.language = q.get("language");
  if (q.get("channel")) where.channel = q.get("channel");
  if (q.get("q")) where.id = { contains: q.get("q") };

  const rows = await prisma.conversation.findMany({
    where,
    orderBy: [{ groupId: "asc" }, { id: "asc" }],
    include: {
      _count: { select: { messages: true } },
      evaluations: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { appeals: { select: { status: true } }, checklist: { select: { name: true, version: true } } },
      },
    },
  });
  const groups = await prisma.conversation.groupBy({ by: ["groupId"], _count: true });

  let items = rows.map((c) => {
    const e = c.evaluations[0];
    return {
      id: c.id,
      groupId: c.groupId,
      channel: c.channel,
      language: c.language,
      durationSec: c.durationSec,
      messageCount: c._count.messages,
      hasAudio: Boolean(c.audioUrl),
      evaluation: e
        ? {
            id: e.id,
            originalTotal: e.originalTotal,
            finalTotal: e.finalTotal,
            hasCriticalError: e.finalCritical,
            checklist: `${e.checklist.name} v${e.checklist.version}`,
            checklistId: e.checklistId,
            openAppeals: e.appeals.filter((a) => a.status === "OPEN").length,
            decidedAppeals: e.appeals.filter((a) => a.status !== "OPEN").length,
            createdAt: e.createdAt.toISOString(),
          }
        : null,
    };
  });
  const evaluated = q.get("evaluated");
  if (evaluated === "yes") items = items.filter((i) => i.evaluation);
  if (evaluated === "no") items = items.filter((i) => !i.evaluation);
  if (evaluated === "critical") items = items.filter((i) => i.evaluation?.hasCriticalError);
  return { items, groups: groups.map((g) => ({ groupId: g.groupId, count: g._count })) };
});
