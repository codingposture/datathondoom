// Creates the organizers' official 8-criterion checklist (idempotent). It is NOT activated, so the team's
// current checklist (with the voice criteria) stays the default; activate it in the UI if wanted.
// Usage: npm run checklist:official
import { prisma } from "../src/lib/db";
import { OFFICIAL_CRITERIA, OFFICIAL_FAMILY, OFFICIAL_NAME, OFFICIAL_SECTIONS } from "../src/lib/officialChecklist";
import { checklistInput } from "../src/lib/schemas";
import { saveChecklistVersion } from "../src/lib/services";

async function main() {
  const existing = await prisma.checklist.findFirst({ where: { family: OFFICIAL_FAMILY }, orderBy: { version: "desc" } });
  if (existing) {
    console.log(`"${existing.name}" v${existing.version} already exists (${existing.id}).`);
    return;
  }
  const input = checklistInput.parse({
    name: OFFICIAL_NAME,
    decimals: 2,
    roundingMode: "half-up",
    criticalPolicy: "flag",
    sections: OFFICIAL_SECTIONS.map(({ key, name }) => ({ key, name })),
    criteria: OFFICIAL_CRITERIA,
  });
  const saved = await saveChecklistVersion(input, OFFICIAL_FAMILY, false);
  console.log(`Created "${saved.name}" v${saved.version} (${saved.id}): ${saved.criteria.map((c) => c.code).join(", ")}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
