import { z } from "zod";
import { handle } from "@/lib/api";
import { prisma } from "@/lib/db";
import { evaluateConversation, getActiveChecklist, HttpError } from "@/lib/services";

/** Applies a checklist to a whole dataset (group) or to a list of conversations. */
export const POST = handle(async (req: Request) => {
  const body = z
    .object({
      checklistId: z.string().optional(),
      groupId: z.string().optional(),
      conversationIds: z.array(z.string()).optional(),
    })
    .parse(await req.json());
  const checklistId = body.checklistId ?? (await getActiveChecklist())?.id;
  if (!checklistId) throw new HttpError(400, "No checklist exists yet");
  let ids = body.conversationIds ?? [];
  if (!ids.length) {
    const rows = await prisma.conversation.findMany({
      where: body.groupId ? { groupId: body.groupId } : {},
      select: { id: true },
      orderBy: { id: "asc" },
    });
    ids = rows.map((r) => r.id);
  }
  const started = Date.now();
  const results: { conversationId: string; total?: number; error?: string }[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    try {
      // Gentle pacing to respect rate limits during batch runs
      if (i > 0) await new Promise((r) => setTimeout(r, 1200));
      const e = await evaluateConversation(id, checklistId);
      results.push({ conversationId: id, total: e.finalTotal });
    } catch (err) {
      results.push({ conversationId: id, error: (err as Error).message });
    }
  }
  return {
    checklistId,
    evaluated: results.filter((r) => r.error === undefined).length,
    failed: results.filter((r) => r.error !== undefined).length,
    ms: Date.now() - started,
    results,
  };
});
