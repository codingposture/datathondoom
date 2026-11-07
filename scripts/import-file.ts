// Imports a dialogs JSON file (organizer format, e.g. problem/invoke.json) into the SQLite database.
// Usage: npm run import:file -- <path> [groupId]
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { parseUploaded } from "../src/lib/organizerApi";
import { importRecords } from "../src/lib/services";

async function main() {
  const [path, groupArg] = process.argv.slice(2);
  if (!path) throw new Error("Usage: npm run import:file -- <path> [groupId]");
  const { groupId, records } = parseUploaded(JSON.parse(readFileSync(path, "utf8")));
  const r = await importRecords(groupArg || groupId || "UPLOAD", records);
  const withAudio = records.filter((x) => x.audio_url).length;
  console.log(`Imported ${r.total} dialogs into group "${r.groupId}" (${r.created} new, ${r.updated} updated, ${withAudio} with audio).`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
