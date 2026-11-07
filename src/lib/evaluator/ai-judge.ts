/**
 * AI #2: Quality Auditor & Scoring Judge
 *
 * Role: Takes the factual dossier from AI #1 (Analyzer) and the specific checklist
 * configuration (criteria, rules, scales, N/A conditions, critical flags),
 * and decides the final score/verdict for every criterion with justifications.
 */
import { callGemini, parseLlmJson, type GeminiContent } from "../ai/geminiClient";
import { callGroq, getGroqApiKey } from "../ai/groqClient";
import type { DialogueAnalysisDossier } from "./ai-analyzer";
import type { ChecklistDef, CriterionVerdict, MessageDto } from "../types";

export async function runChecklistJudge(
  dossier: DialogueAnalysisDossier,
  checklist: ChecklistDef,
  messages: MessageDto[]
): Promise<CriterionVerdict[]> {
  const criteriaText = checklist.criteria
    .map(
      (c) =>
        `- ID: "${c.id}" | ${c.code}: "${c.title}" | ${
          c.answerType === "BINARY" ? "BINARY(yes/no)" : `SCALE(${c.scaleMin}..${c.scaleMax})`
        } | NA: ${c.naAllowed}${c.naRule ? ` (${c.naRule})` : ""}${c.isCritical ? " | CRITICAL" : ""}${
          c.description ? ` | ${c.description}` : ""
        }`
    )
    .join("\n");

  const compactDossier = {
    greeting: dossier.greeting,
    need: dossier.needIdentification,
    consult: dossier.consultation,
    security: dossier.security,
    tone: dossier.politenessAndTone,
    pauses: dossier.waitAndPauses,
    escalation: dossier.escalation,
    closing: dossier.closing,
    audioSummary: dossier.audioAnalysis,
    summary: dossier.analystSummaryRu,
  };

  const convLang = (dossier.language || "ru").toLowerCase();
  const isEn = convLang === "en";
  const isKz = convLang === "kz" || convLang === "kk";
  const langRule = isEn
    ? "6. In explanation, write a clear, objective explanation in ENGLISH with quotes."
    : isKz
    ? "6. Explanation бөлімінде дәлелді түсініктемені ҚАЗАҚ ТІЛІНДЕ жазыңыз."
    : "6. В explanation напиши аргументированное объяснение на русском языке.";

  const systemInstruction = `Ты — беспристрастный Главный судья и аудитор контроля качества (AI #2: Judge).
Твоя задача — изучить аналитическое досье от AI #1 (Analyzer) и вынести вердикт по КАЖДОМУ критерию выданного чек-листа.

ПРАВИЛА:
1. BINARY: "yes", "no" или "na" (если разрешено).
2. SCALE: строка целого числа в границах scaleMin..scaleMax (например "0","1","2") или "na".
3. N/A разрешен ТОЛЬКО если у критерия NA: true. При "na" укажи причину в naReason.
4. В evidenceIdx укажи массив номеров подтверждающих реплик [ID].
5. В checkedRange укажи {from, to} если действие пропущено, иначе null.
${langRule}
7. Для голосовых критериев без аудиозаписи ставь "na" (если разрешено).
Вынеси вердикт ровно по всем критериям (по их ID).`;

  const promptText = `ДОСЬЕ ФАКТОВ AI #1:
${JSON.stringify(compactDossier)}

КРИТЕРИИ ЧЕК-ЛИСТА:
${criteriaText}

Верни строго JSON массив вердиктов по каждому criterionId:
[
  {
    "criterionId": "id",
    "answer": "yes",
    "explanation": "Объяснение...",
    "evidenceIdx": [0],
    "checkedRange": null,
    "naReason": null
  }
]`;

  const contents: GeminiContent[] = [
    {
      role: "user",
      parts: [{ text: promptText }],
    },
  ];

  let rawJson: string;
  const hasGroq = Boolean(getGroqApiKey());

  if (hasGroq) {
    try {
      rawJson = await callGroq({
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: promptText },
        ],
        jsonMode: true,
        temperature: 0.05,
      });
    } catch (groqErr) {
      console.warn("Groq judge failed, falling back to Gemini:", (groqErr as Error).message);
      rawJson = await callGemini({
        systemInstruction,
        contents,
        generationConfig: {
          temperature: 0.05,
          responseMimeType: "application/json",
        },
      });
    }
  } else {
    rawJson = await callGemini({
      systemInstruction,
      contents,
      generationConfig: {
        temperature: 0.05,
        responseMimeType: "application/json",
      },
    });
  }

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
