// Placeholder starting checklist (8 criteria, weights sum to 100).
// Replace with the official checklist from the organizers via the UI or by editing this file.
import type { CriterionHints, SectionDef } from "./types";

export interface CriterionSeed {
  code: string;
  title: string;
  description: string;
  sectionKey: string;
  answerType: "BINARY" | "SCALE";
  scaleMin: number;
  scaleMax: number;
  weight: number;
  naAllowed: boolean;
  naRule: string;
  isCritical: boolean;
  hints: CriterionHints;
}

export const DEFAULT_CHECKLIST_NAME = "Базовый чек-лист CQA";

export const DEFAULT_SECTIONS: SectionDef[] = [
  { key: "open", name: "Начало", order: 0 },
  { key: "consult", name: "Консультация", order: 1 },
  { key: "handling", name: "Ведение диалога", order: 2 },
  { key: "close", name: "Завершение", order: 3 },
];

export const DEFAULT_CRITERIA: CriterionSeed[] = [
  {
    code: "C1",
    title: "Приветствие и представление",
    description: "Оператор приветствует клиента и называет своё имя в первом сообщении.",
    sectionKey: "open",
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
    code: "C2",
    title: "Выявление потребности",
    description: "Оператор уточняет запрос клиента вопросами. 0 — не уточнял, 1 — частично, 2 — задал уточняющие вопросы.",
    sectionKey: "consult",
    answerType: "SCALE",
    scaleMin: 0,
    scaleMax: 2,
    weight: 15,
    naAllowed: false,
    naRule: "",
    isCritical: false,
    hints: { detector: "need" },
  },
  {
    code: "C3",
    title: "Корректность и полнота консультации",
    description: "Ответ по существу, с конкретными шагами. 0 — нет ответа, 3 — полный ответ со следующими шагами.",
    sectionKey: "consult",
    answerType: "SCALE",
    scaleMin: 0,
    scaleMax: 3,
    weight: 20,
    naAllowed: false,
    naRule: "",
    isCritical: false,
    hints: { detector: "consultation" },
  },
  {
    code: "C4",
    title: "Безопасность данных",
    description: "Оператор не запрашивает пароль, PIN, CVV или номер карты и не предлагает перевести деньги лично ему. Нарушение — грубая ошибка.",
    sectionKey: "consult",
    answerType: "BINARY",
    scaleMin: 0,
    scaleMax: 1,
    weight: 10,
    naAllowed: false,
    naRule: "",
    isCritical: true,
    hints: { detector: "security" },
  },
  {
    code: "C5",
    title: "Вежливость и тон",
    description: "Вежливые формулировки, эмпатия, отсутствие грубости. 0 — грубо, 1 — нейтрально, 2 — вежливо и с эмпатией.",
    sectionKey: "handling",
    answerType: "SCALE",
    scaleMin: 0,
    scaleMax: 2,
    weight: 15,
    naAllowed: false,
    naRule: "",
    isCritical: false,
    hints: { detector: "politeness" },
  },
  {
    code: "C6",
    title: "Предупреждение об ожидании",
    description: "Если ответ оператора задерживается более чем на 60 секунд, он предупреждает клиента об ожидании.",
    sectionKey: "handling",
    answerType: "BINARY",
    scaleMin: 0,
    scaleMax: 1,
    weight: 10,
    naAllowed: true,
    naRule: "N/A, если в диалоге не было пауз оператора дольше 60 секунд.",
    isCritical: false,
    hints: { detector: "wait" },
  },
  {
    code: "C7",
    title: "Передача вопроса по регламенту",
    description: "При передаче вопроса специалистам оператор называет срок ответа или следующий шаг.",
    sectionKey: "handling",
    answerType: "BINARY",
    scaleMin: 0,
    scaleMax: 1,
    weight: 10,
    naAllowed: true,
    naRule: "N/A, если передача вопроса не требовалась.",
    isCritical: false,
    hints: { detector: "escalation" },
  },
  {
    code: "C8",
    title: "Завершение диалога",
    description: "Оператор корректно завершает диалог: подводит итог или прощается.",
    sectionKey: "close",
    answerType: "BINARY",
    scaleMin: 0,
    scaleMax: 1,
    weight: 10,
    naAllowed: true,
    naRule: "N/A, если клиент покинул диалог до завершения.",
    isCritical: false,
    hints: { detector: "closing" },
  },
];
