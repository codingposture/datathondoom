import { z } from "zod";
import { handle } from "@/lib/api";
import { prisma } from "@/lib/db";
import { parseJson, toAppealDto } from "@/lib/mappers";
import { createAppeal } from "@/lib/services";
import type { ChecklistDef } from "@/lib/types";

export const GET = handle(async (req: Request) => {
  const status = new URL(req.url).searchParams.get("status");
  const where =
    status === "open" ? { status: "OPEN" } : status === "resolved" ? { status: { in: ["CONFIRMED", "CHANGED"] } } : {};
  const rows = await prisma.appeal.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { criterionResult: true, evaluation: { select: { conversationId: true, checklistSnapshot: true, originalTotal: true, finalTotal: true } } },
  });
  const counts = await prisma.appeal.groupBy({ by: ["status"], _count: true });
  return {
    items: rows.map((a) => {
      const cl = parseJson<ChecklistDef>(a.evaluation.checklistSnapshot, {} as ChecklistDef);
      const c = cl.criteria?.find((x) => x.id === a.criterionResult.criterionId);
      return {
        ...toAppealDto(a),
        conversationId: a.evaluation.conversationId,
        criterionCode: a.criterionResult.code,
        criterionTitle: c?.title ?? a.criterionResult.code,
        originalTotal: a.evaluation.originalTotal,
        finalTotal: a.evaluation.finalTotal,
      };
    }),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
  };
});

export const POST = handle(async (req: Request) => {
  const body = z.object({ criterionResultId: z.string().min(1), comment: z.string().trim().min(1).max(2000) }).parse(await req.json());
  return toAppealDto(await createAppeal(body.criterionResultId, body.comment));
});
