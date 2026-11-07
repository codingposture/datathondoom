// Adds the voice criteria (calls) to the latest active checklist as a new version.
// Usage: npm run checklist:add-voice
// Criteria are measured from the recording (src/lib/audio) and are N/A for chats, so chat scores do not change.
import { prisma } from "../src/lib/db";
import { checklistInput } from "../src/lib/schemas";
import { getActiveChecklist, saveChecklistVersion } from "../src/lib/services";

const SECTION = { key: "voice", name: "Голос и интонация (звонки)" };
const NA_NO_AUDIO = "N/A — нет аудиозаписи (чат) или голос не удалось проанализировать.";

export const VOICE_CRITERIA = [
  {
    code: "V1",
    title: "Интонация и выразительность речи",
    description:
      "Оператор говорит с живой интонацией, а не монотонно. Измеряется вариативность высоты голоса внутри фраз: 0 — монотонно (< 2,2 полутона), 1 — ровно (2,2–3), 2 — выразительно (≥ 3 полутонов).",
    sectionKey: SECTION.key,
    answerType: "SCALE" as const,
    scaleMin: 0,
    scaleMax: 2,
    weight: 5,
    naAllowed: true,
    naRule: NA_NO_AUDIO,
    isCritical: false,
    hints: { detector: "voice_intonation" },
  },
  {
    code: "V2",
    title: "Не перебивает клиента",
    description:
      "Оператор не начинает говорить, пока клиент не закончил фразу (наложение речи ≥ 1 с). Извинение оператора «перебил вас» тоже подтверждает перебивание.",
    sectionKey: SECTION.key,
    answerType: "BINARY" as const,
    scaleMin: 0,
    scaleMax: 1,
    weight: 5,
    naAllowed: true,
    naRule: NA_NO_AUDIO,
    isCritical: false,
    hints: { detector: "voice_interruptions" },
  },
  {
    code: "V3",
    title: "Темп разговора и паузы",
    description:
      "Нет необъяснённых пауз ≥ 5 с, когда клиент ждёт ответа оператора, и оператор отвечает без задержек (медиана ≤ 3 с). Паузы на удержании или после предупреждения об ожидании не учитываются.",
    sectionKey: SECTION.key,
    answerType: "BINARY" as const,
    scaleMin: 0,
    scaleMax: 1,
    weight: 5,
    naAllowed: true,
    naRule: NA_NO_AUDIO,
    isCritical: false,
    hints: { detector: "voice_pace" },
  },
  {
    code: "V4",
    title: "Спокойный тон и реакция на эмоции клиента",
    description:
      "Если клиент взволнован или недоволен (голос заметно выше и громче его обычного, или жалоба), оператор не повышает голос и реагирует на эмоцию клиента.",
    sectionKey: SECTION.key,
    answerType: "BINARY" as const,
    scaleMin: 0,
    scaleMax: 1,
    weight: 5,
    naAllowed: true,
    naRule: "N/A — клиент говорил спокойно, или нет аудиозаписи (чат).",
    isCritical: false,
    hints: { detector: "voice_calm" },
  },
];

async function main() {
  const current = await getActiveChecklist();
  if (!current) throw new Error("No checklist exists yet. Run npm run setup first.");
  const voiceDetectors = new Set(VOICE_CRITERIA.map((c) => c.hints.detector));
  if (current.criteria.some((c) => c.hints.detector && voiceDetectors.has(c.hints.detector))) {
    console.log(`"${current.name}" v${current.version} already has voice criteria — nothing to do.`);
    return;
  }
  const input = checklistInput.parse({
    name: current.name,
    decimals: current.decimals,
    roundingMode: current.roundingMode,
    criticalPolicy: current.criticalPolicy,
    sections: [...current.sections.map(({ key, name }) => ({ key, name })), SECTION],
    criteria: [
      ...current.criteria.map(({ id: _id, order: _order, ...c }) => c),
      ...VOICE_CRITERIA,
    ],
  });
  const saved = await saveChecklistVersion(input, current.family, true);
  console.log(`Saved "${saved.name}" v${saved.version} (active) with ${saved.criteria.length} criteria: ${saved.criteria.map((c) => c.code).join(", ")}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
