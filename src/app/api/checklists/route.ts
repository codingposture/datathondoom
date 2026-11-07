import { handle } from "@/lib/api";
import { prisma } from "@/lib/db";
import { toChecklistDef, type ChecklistRow } from "@/lib/mappers";
import { checklistInput } from "@/lib/schemas";
import { saveChecklistVersion } from "@/lib/services";

export const GET = handle(async () => {
  const rows = await prisma.checklist.findMany({
    include: { sections: true, criteria: true, _count: { select: { evaluations: true } } },
    orderBy: [{ createdAt: "desc" }],
  });
  return rows.map((r) => ({ ...toChecklistDef(r as ChecklistRow), evaluationCount: r._count.evaluations }));
});

export const POST = handle(async (req: Request) => {
  const input = checklistInput.parse(await req.json());
  return saveChecklistVersion(input);
});
