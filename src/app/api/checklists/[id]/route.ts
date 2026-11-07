import { handle, type Params } from "@/lib/api";
import { prisma } from "@/lib/db";
import { checklistInput } from "@/lib/schemas";
import { getChecklist, HttpError, saveChecklistVersion } from "@/lib/services";

export const GET = handle(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const checklist = await getChecklist(id);
  const versions = await prisma.checklist.findMany({
    where: { family: checklist.family },
    select: { id: true, version: true, createdAt: true, isActive: true },
    orderBy: { version: "desc" },
  });
  return { ...checklist, versions };
});

/** Saving never mutates an existing version: it creates version N+1 of the same checklist and activates it. */
export const PUT = handle(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const current = await getChecklist(id);
  const input = checklistInput.parse(await req.json());
  return saveChecklistVersion(input, current.family, true);
});

export const DELETE = handle(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const used = await prisma.evaluation.count({ where: { checklistId: id } });
  if (used > 0) throw new HttpError(409, "This version has evaluations and cannot be deleted");
  await prisma.checklist.delete({ where: { id } });
  return { ok: true };
});
