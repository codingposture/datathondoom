import { z } from "zod";
import { handle, type Params } from "@/lib/api";
import { toAppealDto } from "@/lib/mappers";
import { decideAppeal, getEvaluation } from "@/lib/services";

export const POST = handle(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const body = z
    .object({
      action: z.enum(["confirm", "change"]),
      reason: z.string().trim().min(1).max(2000),
      newAnswer: z.string().optional(),
    })
    .parse(await req.json());
  const appeal = await decideAppeal(id, body.action, body.reason, body.newAnswer);
  return { appeal: toAppealDto(appeal), evaluation: await getEvaluation(appeal.evaluationId) };
});
