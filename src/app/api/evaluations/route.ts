import { z } from "zod";
import { handle } from "@/lib/api";
import { evaluateConversation } from "@/lib/services";

export const POST = handle(async (req: Request) => {
  const body = z.object({ conversationId: z.string().min(1), checklistId: z.string().optional() }).parse(await req.json());
  return evaluateConversation(body.conversationId, body.checklistId);
});
