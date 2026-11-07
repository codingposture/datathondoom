/**
 * AI #2: Quality Auditor & Scoring Judge
 *
 * Role: Takes the factual dossier from AI #1 (Analyzer) and the specific checklist
 * configuration (criteria, rules, scales, N/A conditions, critical flags),
 * and decides the final score/verdict for every criterion with justifications.
 */
import { callGemini, parseLlmJson, type GeminiContent } from "../ai/geminiClient";
import type { DialogueAnalysisDossier } from "./ai-analyzer";
import type { ChecklistDef, CriterionVerdict, MessageDto } from "../types";

export async function runChecklistJudge(
  dossier: DialogueAnalysisDossier,
  checklist: ChecklistDef,
  messages: MessageDto[]
): Promise<CriterionVerdict[]> {
  const criteriaSpec = checklist.criteria.map((c) => ({
    id: c.id,
    code: c.code,
    title: c.title,
    description: c.description,
    answerType: c.answerType, // BINARY | SCALE
    scaleMin: c.scaleMin,
    scaleMax: c.scaleMax,
    weight: c.weight,
    naAllowed: c.naAllowed,
    naRule: c.naRule,
    isCritical: c.isCritical,
  }));

  const systemInstruction = `Ты — беспристрастный Главный судья и аудитор контроля качества (AI #2: Judge).
Твоя задача — изучить аналитическое досье от AI #1 (Analyzer) и вынести официальный вердикт по КАЖДОМУ критерию выданного чек-листа.

ПРАВИЛА ОЦЕНИВАНИЯ:
1. Типы ответов:
   - Для критериев "BINARY": ответ строго "yes" (выполнен), "no" (не выполнен) или "na" (если разрешено naAllowed и применимо naRule).
   - Для критериев "SCALE": ответ строкой целого числа в границах [scaleMin..scaleMax] (например "0", "1", "2") или "na" (если разрешено).
2. N/A (Не применимо):
   - Ответ "na" разрешен ТОЛЬКО если у критерия naAllowed === true и ситуация диалога соответствует naRule.
   - Если naAllowed === false, ответ "na" КАТЕГОРИЧЕСКИ ЗАПРЕЩЕН.
   - При ответе "na" обязательно укажи понятную причину в naReason (на русском языке).
3. Доказательства (evidenceIdx):
   - Укажи массив номеров реплик [ID], подтверждающих твой вердикт.
4. Проверенный участок (checkedRange):
   - Если действие отсутствует или не выполнено, укажи диапазон проверенных реплик { from, to } (например от первой реплики оператора до последней).
5. Обоснование (explanation):
   - Развернуто, четко и аргументированно напиши по-русски, почему выставлен такой балл, опираясь на факты из досье и цитаты.
6. Критичность (isCritical):
   - Для критических критериев (например, безопасность) будь предельно внимателен к любым нарушениям. Нарушение критического критерия приводит к грубой ошибке.

Ты должен вернуть вердикт ровно по КАЖДОМУ критерию из переданного списка (по его ID).`;

  const promptText = `ДОСЬЕ ОТ AI #1 (ANALYZER):
${JSON.stringify(dossier, null, 2)}

КРИТЕРИИ ДЛЯ ОЦЕНКИ И ВЕСА (CHECKLIST):
${JSON.stringify(criteriaSpec, null, 2)}

ОБЩЕЕ ЧИСЛО РЕПЛИК В ДИАЛОГЕ: ${messages.length}

Верни вердикт строго в JSON-массиве следующего формата:
[
  {
    "criterionId": "id_критерия_из_списка",
    "answer": "yes", // или "no", "na", или числовая строка "0", "1", "2"
    "explanation": "Подробное объяснение решения на русском языке...",
    "evidenceIdx": [0, 2], // номера сообщений
    "checkedRange": null, // или {"from": 0, "to": 15} если действие пропущено
    "naReason": null // или строка с объяснением причины N/A если answer === "na"
  }
]`;

  const contents: GeminiContent[] = [
    {
      role: "user",
      parts: [{ text: promptText }],
    },
  ];

  const rawJson = await callGemini({
    systemInstruction,
    contents,
    generationConfig: {
      temperature: 0.05, // минимальная температура для строгого следования правилам
      responseMimeType: "application/json",
    },
  });

  interface RawVerdict {
    criterionId: string;
    answer: string;
    explanation: string;
    evidenceIdx?: number[];
    checkedRange?: { from: number; to: number } | null;
    naReason?: string | null;
  }

  const parsedList = parseLlmJson<RawVerdict[]>(rawJson);
  const verdictsMap = new Map<string, RawVerdict>();

  for (const item of parsedList) {
    if (item && item.criterionId) {
      verdictsMap.set(String(item.criterionId), item);
    }
  }

  // Ensure every criterion from the checklist is covered and validated
  const result: CriterionVerdict[] = checklist.criteria.map((c) => {
    const verdict = verdictsMap.get(c.id);

    if (!verdict) {
      // Fallback if model missed a criterion
      return {
        criterionId: c.id,
        answer: c.naAllowed ? "na" : c.answerType === "BINARY" ? "no" : String(c.scaleMin),
        explanation: `Критерий ${c.code} (${c.title}): не удалось получить автоматическую оценку от модели.`,
        evidenceIdx: [],
        checkedRange: { from: 0, to: Math.max(0, messages.length - 1) },
        naReason: c.naAllowed ? "Критерий отмечен N/A по умолчанию." : null,
      };
    }

    let answer = String(verdict.answer).trim().toLowerCase();

    // Enforce N/A rules
    if (answer === "na" && !c.naAllowed) {
      answer = c.answerType === "BINARY" ? "yes" : String(c.scaleMax);
    }

    // Enforce BINARY rules
    if (c.answerType === "BINARY" && answer !== "na") {
      if (answer !== "yes" && answer !== "no") {
        answer = answer === "1" || answer === "true" ? "yes" : "no";
      }
    }

    // Enforce SCALE bounds
    if (c.answerType === "SCALE" && answer !== "na") {
      const num = parseInt(answer, 10);
      if (isNaN(num) || num < c.scaleMin || num > c.scaleMax) {
        answer = String(c.scaleMin);
      } else {
        answer = String(num);
      }
    }

    const evidenceIdx = Array.isArray(verdict.evidenceIdx)
      ? verdict.evidenceIdx.map(Number).filter((n) => !isNaN(n))
      : [];

    const checkedRange =
      verdict.checkedRange &&
      typeof verdict.checkedRange.from === "number" &&
      typeof verdict.checkedRange.to === "number"
        ? { from: verdict.checkedRange.from, to: verdict.checkedRange.to }
        : null;

    const naReason = answer === "na" ? verdict.naReason || c.naRule || "Критерий не применим" : null;

    return {
      criterionId: c.id,
      answer,
      explanation: verdict.explanation || `Оценка критерия ${c.code}`,
      evidenceIdx,
      checkedRange,
      naReason,
    };
  });

  return result;
}
