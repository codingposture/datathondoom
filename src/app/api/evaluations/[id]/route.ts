import { handle, type Params } from "@/lib/api";
import { getEvaluation } from "@/lib/services";

export const GET = handle(async (_req: Request, { params }: Params<"id">) => getEvaluation((await params).id));
