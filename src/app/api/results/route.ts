import { handle } from "@/lib/api";
import { prisma } from "@/lib/db";
import { OFFICIAL_FAMILY } from "@/lib/officialChecklist";
import { describeModels, entryFor, errorEntry, validateResults, type ResultEntry, type ResultsFile } from "@/lib/results";
import { getEvaluation, HttpError } from "@/lib/services";

/**
 * GET /api/results?groupId=DEV&team=Name[&official=1] — results.json (organizers' format 1.0) built from the latest
 * AI evaluation of every dialog with the team checklist v4 (mapped onto the 8 official IDs), or with the official
 * checklist when official=1. Does not evaluate anything: dialogs without such an evaluation are reported as
 * status "error". Use `npm run results:export` to evaluate and write the file.
 */
export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const groupId = q.get("groupId") || "DEV";
  const team = q.get("team") || process.env.TEAM_NAME || "datathondoom";
  const checklist =
    q.get("official") === "1"
      ? await prisma.checklist.findFirst({ where: { family: OFFICIAL_FAMILY }, orderBy: { version: "desc" } })
      : await prisma.checklist.findFirst({ where: { name: "Базовый чек-лист CQA", version: 4 } });
  if (!checklist) throw new HttpError(400, "Checklist not found");
  const conversations = await prisma.conversation.findMany({
    where: { groupId },
    orderBy: { id: "asc" },
    select: { id: true, _count: { select: { messages: true } } },
  });
  if (!conversations.length) throw new HttpError(404, `No dialogs in group ${groupId}`);

  const entries: ResultEntry[] = [];
  const routes: string[] = [];
  for (const c of conversations) {
    const ev = await prisma.evaluation.findFirst({
      where: { conversationId: c.id, checklistId: checklist.id, evaluator: { contains: ":" }, NOT: { evaluator: { contains: "heuristic" } } },
      orderBy: { createdAt: "desc" },
      select: { id: true, evaluator: true },
    });
    if (!ev || !ev.evaluator.includes(":")) {
      entries.push(errorEntry(c.id, `Not evaluated by an AI model with «${checklist.name}» v${checklist.version} yet.`));
      continue;
    }
    try {
      routes.push(ev.evaluator);
      entries.push(entryFor(c.id, c._count.messages, await getEvaluation(ev.id)));
    } catch (e) {
      entries.push(errorEntry(c.id, (e as Error).message));
    }
  }
  const file: ResultsFile = { schema_version: "1.0", team_name: team, model: describeModels(routes), results: entries };
  const problems = validateResults(file, conversations.map((c) => c.id));
  return new Response(JSON.stringify(file, null, 2) + "\n", {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="results-${groupId}.json"`,
      "x-results-problems": String(problems.length),
    },
  });
});
