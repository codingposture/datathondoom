import { handle, type Params } from "@/lib/api";
import { activateChecklist } from "@/lib/services";

export const POST = handle(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  await activateChecklist(id);
  return { ok: true };
});
