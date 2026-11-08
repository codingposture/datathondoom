// Creates the next version of the team checklist «Базовый чек-лист CQA» that matches the results format:
// the organizers' 8 criteria (codes = results.json criterion_id, official scales/weights/N/A rules) plus the
// team voice criteria V1–V4 copied from the current version (used for calls; N/A for chats). Saved as active.
// Usage: npm run checklist:v5
import { prisma } from "../src/lib/db";
import { OFFICIAL_CODES, OFFICIAL_CRITERIA, OFFICIAL_SECTIONS } from "../src/lib/officialChecklist";
import { checklistInput } from "../src/lib/schemas";
import { getChecklist, saveChecklistVersion } from "../src/lib/services";

const TEAM_NAME = "Базовый чек-лист CQA";

async function main() {
  const latest = await prisma.checklist.findFirst({ where: { name: TEAM_NAME }, orderBy: { version: "desc" } });
  if (!latest) throw new Error(`Checklist «${TEAM_NAME}» not found`);
  const current = await getChecklist(latest.id);
  if (OFFICIAL_CODES.every((code) => current.criteria.some((c) => c.code === code))) {
    console.log(`«${TEAM_NAME}» v${current.version} already has the official criteria — nothing to do.`);
    return;
  }
  const voice = current.criteria.filter((c) => /^V\d+$/.test(c.code));
  const voiceSections = current.sections.filter((s) => voice.some((c) => c.sectionKey === s.key));
  const input = checklistInput.parse({
    name: TEAM_NAME,
    decimals: 2,
    roundingMode: "half-up",
    criticalPolicy: "flag", // critical errors are flagged separately and do not zero the total
    sections: [...OFFICIAL_SECTIONS, ...voiceSections].map(({ key, name }) => ({ key, name })),
    criteria: [...OFFICIAL_CRITERIA, ...voice.map(({ id: _id, order: _order, ...c }) => c)],
  });
  const saved = await saveChecklistVersion(input, current.family, true);
  console.log(`Saved «${saved.name}» v${saved.version} (active, ${saved.id}): ${saved.criteria.map((c) => c.code).join(", ")}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
