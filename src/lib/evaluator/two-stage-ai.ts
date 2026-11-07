/**
 * Two-Stage AI Evaluator:
 * - Text Chats (60 of 65 dialogs): Uses ultra-fast unified Groq pipeline (Analysis + Judgment in 1 call, ~750 tokens, 3s).
 * - Voice Calls (5 dialogs with audio): Uses Gemini multimodal to inspect audio recording bytes, or acoustic metrics.
 * - Resilience: Auto-retries rate limits (up to 25s) and falls back to calibrated heuristic engine if both APIs are down.
 */
import { callGroq, getGroqApiKey, parseLlmJson } from "../ai/groqClient";
import { runConversationAnalyzer } from "./ai-analyzer";
import { runChecklistJudge } from "./ai-judge";
import { mockEvaluator } from "./mock";
import type { AudioBundle } from "../audio/metrics";
import type { Evaluator } from "./types";
import type { ChecklistDef, ConversationDto, CriterionVerdict, MessageDto } from "../types";

async function evaluateUnifiedGroq(
  conversation: ConversationDto,
  messages: MessageDto[],
  checklist: ChecklistDef
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

  const transcript = messages
    .map((m) => `[${m.idx}] ${m.speaker.toUpperCase()}: ${m.text}`)
    .join("\n");

  const systemInstruction = `Ты — эксперт отдела контроля качества клиентского сервиса Freedom Broker.
Твоя задача — объективно проанализировать диалог и выставить оценки по критериям выданного чек-листа.

ПРАВИЛА ОЦЕНИВАНИЯ:
1. BINARY: ответ "yes", "no" или "na" (если разрешено NA: true).
2. SCALE: целое число в границах scaleMin..scaleMax или "na".
3. NA разрешен ТОЛЬКО если указано NA: true. При "na" укажи naReason.
4. В evidenceIdx укажи массив номеров реплик [ID], подтверждающих вердикт.
5. В checkedRange укажи {from, to} если действие пропущено, иначе null.
6. В explanation напиши четкое, аргументированное обоснование на русском языке с цитатами.
7. Критический критерий (CRITICAL) — нарушение приводит к грубой ошибке.
8. Голосовые критерии без аудиозаписи ставь в "na" (если разрешено).

Верни строго JSON следующего формата:
{
  "summary": "Краткое аналитическое резюме по диалогу на русском языке",
  "verdicts": [
    {
      "criterionId": "id_из_списка",
      "answer": "yes",
      "explanation": "Обоснование...",
      "evidenceIdx": [0],
      "checkedRange": null,
      "naReason": null
    }
  ]
}`;

  const promptText = `ТРАНСКРИПТ:
${transcript}

КРИТЕРИИ ЧЕК-ЛИСТА:
${criteriaText}`;

  const raw = await callGroq({
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: promptText },
    ],
    jsonMode: true,
    temperature: 0.1,
  });

  interface RawItem {
    criterionId?: string;
    answer?: string;
    explanation?: string;
    evidenceIdx?: number[];
    checkedRange?: { from: number; to: number } | null;
    naReason?: string | null;
  }

  const parsed = parseLlmJson<{ summary?: string; verdicts?: RawItem[] }>(raw);
  const verdictsMap = new Map<string, RawItem>();
  for (const v of parsed.verdicts || []) {
    if (v && v.criterionId) verdictsMap.set(String(v.criterionId), v);
  }

  return checklist.criteria.map((c) => {
    const v = verdictsMap.get(c.id);
    if (!v) {
      return {
        criterionId: c.id,
        answer: c.naAllowed ? "na" : c.answerType === "BINARY" ? "no" : String(c.scaleMin),
        explanation: `Критерий ${c.code} (${c.title}): автоматическая оценка`,
        evidenceIdx: [],
        checkedRange: null,
        naReason: c.naAllowed ? "Не применимо по умолчанию" : null,
      };
    }

    let answer = String(v.answer).trim().toLowerCase();
    if (answer === "na" && !c.naAllowed) {
      answer = c.answerType === "BINARY" ? "yes" : String(c.scaleMax);
    }
    if (c.answerType === "BINARY" && answer !== "na") {
      answer = answer === "yes" || answer === "1" || answer === "true" ? "yes" : "no";
    }
    if (c.answerType === "SCALE" && answer !== "na") {
      const num = parseInt(answer, 10);
      answer = isNaN(num) || num < c.scaleMin || num > c.scaleMax ? String(c.scaleMin) : String(num);
    }

    return {
      criterionId: c.id,
      answer,
      explanation: v.explanation || `Оценка критерия ${c.code}`,
      evidenceIdx: Array.isArray(v.evidenceIdx)
        ? v.evidenceIdx.map(Number).filter((n: number) => !isNaN(n))
        : [],
      checkedRange: v.checkedRange && typeof v.checkedRange === "object" ? v.checkedRange : null,
      naReason: answer === "na" ? v.naReason || c.naRule || "Критерий не применим" : null,
    };
  });
}

export const twoStageAiEvaluator: Evaluator = {
  name: "two-stage-ai-v1",
  wantsAudioBytes: true,
  async evaluate({
    conversation,
    messages,
    checklist,
    audio,
  }: {
    conversation: ConversationDto;
    messages: MessageDto[];
    checklist: ChecklistDef;
    audio?: AudioBundle | null;
  }): Promise<CriterionVerdict[]> {
    try {
      const hasAudioBytes = Boolean(audio?.bytes && audio.bytes.byteLength > 0);
      const hasGroq = Boolean(getGroqApiKey());

      // 1. For text chats without audio: run the ultra-fast unified Groq pipeline (1 call, 750 tokens, 3s)
      if (!hasAudioBytes && hasGroq) {
        return await evaluateUnifiedGroq(conversation, messages, checklist);
      }

      // 2. For calls with audio: run multimodal analyzer -> judge
      const dossier = await runConversationAnalyzer(conversation, messages, audio ?? null);
      const verdicts = await runChecklistJudge(dossier, checklist, messages);
      return verdicts;
    } catch (aiErr) {
      console.warn("AI evaluation unavailable, falling back to heuristic engine:", (aiErr as Error).message);
      return mockEvaluator.evaluate({ conversation, messages, checklist, audio });
    }
  },
};
