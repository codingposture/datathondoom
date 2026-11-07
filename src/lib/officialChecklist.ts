// The organizers' official checklist ("Чек-лист качества чатов", problem/CQA_Chat_Quality_Checklist 1.pdf),
// with criterion codes equal to the results.json criterion_id values (CQA_Student_Guide_Appendix_Results.pdf).
import type { CriterionSeed } from "./defaultChecklist";
import type { SectionDef } from "./types";

export const OFFICIAL_FAMILY = "official-cqa-chat";
export const OFFICIAL_NAME = "Чек-лист качества чатов (официальный)";

/** results.json criterion order. */
export const OFFICIAL_CODES = ["contact", "discovery", "identification", "consultation", "empathy", "dialogue", "closure", "critical"] as const;
export type OfficialCode = (typeof OFFICIAL_CODES)[number];

export const OFFICIAL_SECTIONS: SectionDef[] = [
  { key: "opening", name: "Начало и понимание запроса", order: 0 },
  { key: "resolution", name: "Безопасность и решение", order: 1 },
  { key: "handling", name: "Ведение и завершение диалога", order: 2 },
  { key: "violations", name: "Грубые нарушения", order: 3 },
];

const NO_VS_NA =
  "«Нет» — действие было нужно, но оператор его пропустил или выполнил неправильно; N/A — только при выполнении условия неприменимости.";

export const OFFICIAL_CRITERIA: CriterionSeed[] = [
  {
    code: "contact",
    title: "Установление контакта",
    description: "Да — оператор поздоровался на языке клиента и представился в первом ответе.",
    sectionKey: "opening",
    answerType: "BINARY",
    scaleMin: 0,
    scaleMax: 1,
    weight: 10,
    naAllowed: false,
    naRule: "",
    isCritical: false,
    hints: { detector: "greeting" },
  },
  {
    code: "discovery",
    title: "Выявление потребности",
    description: `Да — оператор учёл известные детали и уточнил недостающее до ответа. ${NO_VS_NA}`,
    sectionKey: "opening",
    answerType: "BINARY",
    scaleMin: 0,
    scaleMax: 1,
    weight: 15,
    naAllowed: true,
    naRule: "N/A — данных для ответа хватало с самого начала.",
    isCritical: false,
    hints: { detector: "need" },
  },
  {
    code: "identification",
    title: "Идентификация",
    description:
      "Да — проверка личности подтверждена до раскрытия данных или защищённого действия (подтверждением считается и системное сообщение о подтверждении личности). Если проверка личности требовалась перед защищённым действием и не подтверждена в диалоге — «Нет». Общий вопрос (например, о тарифах) идентификации не требует.",
    sectionKey: "resolution",
    answerType: "BINARY",
    scaleMin: 0,
    scaleMax: 1,
    weight: 20,
    naAllowed: true,
    naRule: "N/A — запрос не требовал идентификации.",
    isCritical: false,
    hints: { detector: "keywords", keywords: { RU: ["личность подтвержден", "подтвердить личность", "идентификац"], KZ: ["жеке басы расталды", "жеке басыңызды раста"], EN: ["identity verified", "verify your identity"] } },
  },
  {
    code: "consultation",
    title: "Корректная и полная консультация",
    description:
      "Оцените ответ или следующий шаг. 20 — все существенные вопросы закрыты или дан корректный следующий шаг; 15 — основной вопрос решён, пропущена второстепенная деталь; 10 — часть запроса закрыта, существенный вопрос остался открытым; 5 — есть общая подсказка, но клиенту всё ещё непонятно, как действовать; 0 — ответа по существу нет или ключевая рекомендация ошибочна. Консультация оценивает, правильно и полно ли решён запрос (не манеру общения).",
    sectionKey: "resolution",
    answerType: "SCALE",
    scaleMin: 0,
    scaleMax: 20,
    weight: 20,
    naAllowed: true,
    naRule: "N/A — чат закончился до того, как клиент сформулировал запрос.",
    isCritical: false,
    hints: { detector: "consultation", steps: [0, 5, 10, 15, 20] },
  },
  {
    code: "empathy",
    title: "Эмпатия и клиентоориентированность",
    description:
      "Да — оператор вежлив и, если клиент выразил недовольство или описал неудобство, отреагировал на конкретную проблему.",
    sectionKey: "handling",
    answerType: "BINARY",
    scaleMin: 0,
    scaleMax: 1,
    weight: 15,
    naAllowed: false,
    naRule: "",
    isCritical: false,
    hints: { detector: "politeness" },
  },
  {
    code: "dialogue",
    title: "Управление диалогом, скорость и грамотность",
    description:
      "Оцените ясность, порядок ответов и предупреждение об ожидании. 10 — ответы ясные и связные, при явном ожидании оператор предупредил; 7 — один заметный сбой, но клиент может понять ответ и продолжить; 4 — клиенту приходится переспрашивать из-за формулировок или порядка ответов; 0 — из-за бессвязных или противоречивых реплик ход диалога непонятен. Порог первой реакции, теги и вложения не оцениваются.",
    sectionKey: "handling",
    answerType: "SCALE",
    scaleMin: 0,
    scaleMax: 10,
    weight: 15,
    naAllowed: false,
    naRule: "",
    isCritical: false,
    hints: { detector: "wait", steps: [0, 4, 7, 10] },
  },
  {
    code: "closure",
    title: "Завершение",
    description: "Да — оператор подвёл итог или предложил дальнейшую помощь и попрощался.",
    sectionKey: "handling",
    answerType: "BINARY",
    scaleMin: 0,
    scaleMax: 1,
    weight: 5,
    naAllowed: true,
    naRule: "N/A — чат оборвался до возможности его завершить.",
    isCritical: false,
    hints: { detector: "closing" },
  },
  {
    // Stored inverted so the app's critical-error flag works: "yes" = no critical violation.
    // results.json value (true = violation found) = answer === "no".
    code: "critical",
    title: "Отсутствие грубых ошибок",
    description:
      "Без баллов, отмечается отдельно. Да — грубых нарушений нет. Нет — выявлено хотя бы одно: оскорбление клиента; предложение платной услуги в обход компании (например, перевести деньги оператору лично для инвестирования или дать личный номер для частной платной консультации — достаточно самого предложения); раскрытие конфиденциальной информации.",
    sectionKey: "violations",
    answerType: "BINARY",
    scaleMin: 0,
    scaleMax: 1,
    weight: 0,
    naAllowed: false,
    naRule: "",
    isCritical: true,
    hints: { detector: "security" },
  },
];
