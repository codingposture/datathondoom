// Seeds the default checklist (only if no checklist exists yet).
import { prisma } from "../src/lib/db";
import { DEFAULT_CHECKLIST_NAME, DEFAULT_CRITERIA, DEFAULT_SECTIONS } from "../src/lib/defaultChecklist";
import { checklistInput } from "../src/lib/schemas";
import { saveChecklistVersion } from "../src/lib/services";

async function main() {
  const count = await prisma.checklist.count();
  if (count > 0) {
    console.log(`Checklists already exist (${count}), skipping seed.`);
    return;
  }
  const input = checklistInput.parse({
    name: DEFAULT_CHECKLIST_NAME,
    decimals: 1,
    roundingMode: "half-up",
    criticalPolicy: "flag",
    sections: DEFAULT_SECTIONS.map(({ key, name }) => ({ key, name })),
    criteria: DEFAULT_CRITERIA,
  });
  const cl = await saveChecklistVersion(input, "default", true);
  console.log(`Seeded checklist "${cl.name}" v${cl.version} with ${cl.criteria.length} criteria.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
