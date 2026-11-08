// Evaluates a dataset through the backend and writes results/<set>/results.json
// in the organizers' format (problem/CQA_Student_Guide_Appendix_Results.pdf).
//
// Usage:
//   npm run results:export -- --set dev --source problem/invoke.json --team "Team name"
//   npm run results:export -- --set prod --group <control group_id> --team "Team name"
// Options:
//   --set dev|prod      output folder (results/dev or results/prod); prod must contain exactly 10 records
//   --source <file>     import dialogs from a JSON file first (organizer format) and keep its order/IDs
//   --group <id>        dataset group in the database (default: from --source, else DEV)
//   --team <name>       team_name (or env TEAM_NAME)
//   --checklist <id>    checklist to evaluate with (default: latest version of the team checklist «Базовый чек-лист CQA»)
//   --official          use the organizers' 8-criterion checklist instead of v4
//   --max-wait <sec>    longest rate-limit wait to sit out per retry (default 300)
//   --fresh             re-evaluate everything instead of reusing earlier AI evaluations with the same checklist
// Team checklist v4 results are mapped onto the 8 official criterion IDs (see buildEntryFromV4 in src/lib/results.ts).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { prisma } from "../src/lib/db";
import { OFFICIAL_FAMILY } from "../src/lib/officialChecklist";
import { parseUploaded } from "../src/lib/organizerApi";
import { describeModels, entryFor, errorEntry, validateResults, type ResultEntry, type ResultsFile } from "../src/lib/results";
import { evaluateConversation, getEvaluation, importRecords } from "../src/lib/services";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function evaluateWithRetry(id: string, checklistId: string, tries = 5) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await evaluateConversation(id, checklistId);
    } catch (e) {
      const msg = (e as Error).message;
      const wait = /try again in ([\d.]+)\s*(ms|s|m)/i.exec(msg);
      const rateLimited = /\b429\b|rate limit/i.test(msg);
      if (!rateLimited || attempt >= tries) throw e;
      let sec = wait ? Number(wait[1]) * (wait[2] === "m" ? 60 : wait[2] === "ms" ? 0.001 : 1) : 30;
      const maxWait = Number(arg("max-wait") ?? 300);
      if (sec > maxWait) throw new Error(`Rate limit: retry in ${Math.round(sec)} s exceeds the export window. ${msg.slice(0, 200)}`);
      sec = Math.min(maxWait, sec + 2);
      console.log(`  ${id}: rate limited, waiting ${Math.round(sec)} s (attempt ${attempt}/${tries})`);
      await sleep(sec * 1000);
    }
  }
}

async function main() {
  const set = arg("set") ?? "dev";
  if (set !== "dev" && set !== "prod") throw new Error("--set must be dev or prod");
  const team = arg("team") ?? process.env.TEAM_NAME ?? "Covenant";
  process.env.EVALUATOR_STRICT = "1"; // never replace an AI evaluation with heuristics in official results

  // 1. Dataset (optionally imported from the organizer JSON file, preserving its IDs and order).
  let groupId = arg("group");
  let order: string[];
  if (arg("source")) {
    const parsed = parseUploaded(JSON.parse(readFileSync(resolve(arg("source")!), "utf8")));
    groupId = groupId ?? parsed.groupId ?? "UPLOAD";
    const r = await importRecords(groupId, parsed.records);
    console.log(`Imported ${r.total} dialogs into group ${groupId} (${r.created} new, ${r.updated} updated).`);
    order = parsed.records.map((x) => x.conversation_id);
  } else {
    groupId = groupId ?? "DEV";
    order = (await prisma.conversation.findMany({ where: { groupId }, select: { id: true }, orderBy: { id: "asc" } })).map((c) => c.id);
  }
  if (!order.length) throw new Error(`No dialogs in group ${groupId}`);

  // 2. Checklist: team checklist v4 by default; --official for the organizers' 8 criteria; --checklist <id> explicit.
  const checklist = arg("checklist")
    ? await prisma.checklist.findUnique({ where: { id: arg("checklist")! } })
    : flag("official")
      ? await prisma.checklist.findFirst({ where: { family: OFFICIAL_FAMILY }, orderBy: { version: "desc" } })
      : await prisma.checklist.findFirst({ where: { name: "Базовый чек-лист CQA" }, orderBy: { version: "desc" } });
  if (!checklist) throw new Error("Checklist not found («Базовый чек-лист CQA», or run npm run checklist:official for --official)");
  console.log(`Checklist: ${checklist.name} v${checklist.version}. Evaluating ${order.length} dialogs of ${groupId}…`);

  // 3. Evaluate (or reuse) each dialog through the backend.
  const entries: ResultEntry[] = [];
  const routes: string[] = [];
  let i = 0;
  for (const id of order) {
    i++;
    const turns = (await prisma.message.findMany({ where: { conversationId: id }, orderBy: { idx: "asc" }, select: { speaker: true } })).map((m) => m.speaker);
    try {
      const prev = flag("fresh")
        ? null
        : await prisma.evaluation.findFirst({
            // Only evaluations that recorded an AI route (provider:model) and were not heuristic fallbacks.
            where: { conversationId: id, checklistId: checklist.id, evaluator: { contains: ":" }, NOT: { evaluator: { contains: "heuristic" } } },
            orderBy: { createdAt: "desc" },
          });
      const ev = prev ? await getEvaluation(prev.id) : await evaluateWithRetry(id, checklist.id);
      if (ev.evaluator.includes("heuristic") || !ev.evaluator.includes(":")) throw new Error(`Evaluation was not produced by an AI model (${ev.evaluator})`);
      routes.push(ev.evaluator);
      const entry = entryFor(id, turns, ev);
      entries.push(entry);
      if (entry.status === "ok") console.log(`[${i}/${order.length}] ${id}  ${entry.score.final_score}${entry.score.critical_flag ? "  CRITICAL" : ""}  ${prev ? "(reused)" : ""}  ${ev.evaluator.split(":").slice(1).join(":")}`);
    } catch (e) {
      const msg = (e as Error).message;
      entries.push(errorEntry(id, msg));
      console.log(`[${i}/${order.length}] ${id}  ERROR  ${msg.slice(0, 160)}`);
    }
  }

  // 4. Assemble, validate, write.
  const file: ResultsFile = { schema_version: "1.0", team_name: team, model: describeModels(routes), results: entries };
  const problems = validateResults(file, order, set === "prod" ? 10 : undefined);
  const out = resolve("results", set, "results.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(file, null, 2) + "\n", "utf8");

  const ok = entries.filter((e) => e.status === "ok").length;
  console.log(`\nWrote ${out}: ${entries.length} records (${ok} ok, ${entries.length - ok} error). Model: ${file.model.mode} — ${file.model.name}`);
  if (problems.length) {
    console.log(`Validation problems (${problems.length}):\n  ${problems.slice(0, 30).join("\n  ")}`);
    process.exitCode = 1;
  } else console.log("Validation: OK");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
