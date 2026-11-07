/**
 * Two-Stage AI Evaluator:
 * - Text Chats (60 of 65 dialogs): Uses ultra-fast unified Groq pipeline (Analysis + Judgment in 1 call, ~750 tokens, 3s).
 * - Voice Calls (5 dialogs with audio): Uses Gemini multimodal to inspect audio recording bytes, or acoustic metrics.
 * - Resilience: Auto-retries rate limits (up to 25s); if Gemini fails a call is re-evaluated on its transcript with Groq;
 *   heuristics are used only as a last resort and never in strict mode (EVALUATOR_STRICT=1, official results export).
 */
import { getGeminiModel } from "../ai/geminiClient";
import { callGroq, getGroqApiKey, getGroqModel, parseLlmJson } from "../ai/groqClient";
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
          c.answerType === "BINARY"
            ? "BINARY(yes/no)"
            : c.hints?.steps?.length
              ? `SCALE(one of: ${c.hints.steps.join(", ")})`
              : `SCALE(${c.scaleMin}..${c.scaleMax})`
        } | NA: ${c.naAllowed}${c.naRule ? ` (${c.naRule})` : ""}${c.isCritical ? " | CRITICAL" : ""}${
          c.description ? ` | ${c.description}` : ""
        }`
    )
    .join("\n");

  const transcript = messages
    .map((m) => `[${m.idx}] ${m.speaker.toUpperCase()}: ${m.text}`)
    .join("\n");

  const convLang = (conversation.language || "ru").toLowerCase();
  const isEn = convLang === "en";
  const isKz = convLang === "kz" || convLang === "kk";

  const systemInstruction = isEn
    ? `You are an expert QA evaluator for customer support at Freedom Broker.
Your task is to objectively evaluate the dialogue against the criteria of the given checklist.

CRITICAL LANGUAGE REQUIREMENT:
- Write the "summary" and ALL "explanation" values in ENGLISH with quotes from the transcript.

EVALUATION RULES:
1. BINARY: "yes", "no", or "na" (only if NA: true).
2. SCALE: integer string within scaleMin..scaleMax or "na".
3. NA allowed ONLY if NA: true. For "na", provide naReason in English.
4. evidenceIdx: array of message index IDs supporting the verdict.
5. checkedRange: {from, to} if an action was omitted, otherwise null.
6. explanation: clear, objective explanation in English with quotes.
7. CRITICAL: violation of critical criteria fails the dialogue.
8. Voice criteria without recording should be "na" (if allowed).

Return STRICTLY JSON:
{
  "summary": "Brief analytical summary of the dialogue in English",
  "verdicts": [
    {
      "criterionId": "id",
      "answer": "yes",
      "explanation": "Clear explanation in English...",
      "evidenceIdx": [0],
      "checkedRange": null,
      "naReason": null
    }
  ]
}`
    : isKz
    ? `Сіз — Freedom Broker клиенттік сервисінің сапаны бақылау бөлімінің сарапшысысыз.
Сіздің міндетіңіз — диалогты объективті талдап, чек-парақ критерийлері бойынша бағалау.

ТІЛ ТАЛАБЫ:
- "summary" және барлық "explanation" мәндерін ҚАЗАҚ ТІЛІНДЕ транскрипттен дәйексөздермен жазыңыз.

БАҒАЛАУ ЕРЕЖЕЛЕРІ:
1. BINARY: "yes", "no" немесе "na" (егер NA: true рұқсат етілсе).
2. SCALE: scaleMin..scaleMax шегіндегі бүтін сан немесе "na".
3. NA тек NA: true көрсетілгенде ғана рұқсат етіледі. "na" үшін naReason қазақша жазыңыз.
4. evidenceIdx: вердикті растайтын реплика нөмірлері [ID].
5. checkedRange: егер әрекет өткізіп алынса {from, to}, әйтпесе null.
6. explanation: қазақ тіліндегі дәлелді негіздеме.
7. CRITICAL критерий — бұзу өрескел қате болып саналады.
8. Аудиожазбасыз дауыстық критерийлер "na" болады (рұқсат етілсе).

ҚАТАҢ JSON қайтарыңыз:
{
  "summary": "Диалог бойынша қысқаша аналитикалық қорытынды қазақ тілінде",
  "verdicts": [
    {
      "criterionId": "id",
      "answer": "yes",
      "explanation": "Қазақ тіліндегі негіздеме...",
      "evidenceIdx": [0],
      "checkedRange": null,
      "naReason": null
    }
  ]
}`
    : `Ты — эксперт отдела контроля качества клиентского сервиса Freedom Broker.
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

  const promptText = isEn
    ? `TRANSCRIPT:
${transcript}

CHECKLIST CRITERIA:
${criteriaText}`
    : isKz
    ? `ТРАНСКРИПТ:
${transcript}

ЧЕК-ПАРАҚ КРИТЕРИЙЛЕРІ:
${criteriaText}`
    : `ТРАНСКРИПТ:
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
    // The returned array carries `route`: which model(s) actually produced the verdicts (stored with the evaluation).
    const withRoute = (v: CriterionVerdict[], route: string) => Object.assign(v, { route });
    const groqModel = getGroqModel();
    const geminiModel = getGeminiModel();
    const hasAudioBytes = Boolean(audio?.bytes && audio.bytes.byteLength > 0);
    const hasGroq = Boolean(getGroqApiKey());
    let lastErr: Error | null = null;

    // 1. Calls with audio: Gemini listens (analyzer) → Groq judges (Gemini if Groq fails).
    if (hasAudioBytes) {
      try {
        const dossier = await runConversationAnalyzer(conversation, messages, audio ?? null);
        const verdicts = await runChecklistJudge(dossier, checklist, messages);
        return withRoute(verdicts, `gemini:${geminiModel}+groq:${groqModel}`);
      } catch (e) {
        lastErr = e as Error;
        console.warn("Audio evaluation (Gemini) failed, retrying on the transcript with Groq:", lastErr.message);
      }
    }

    // 2. Chats (and calls whose audio route failed): unified Groq pipeline on the transcript.
    if (hasGroq) {
      try {
        const verdicts = await evaluateUnifiedGroq(conversation, messages, checklist);
        return withRoute(verdicts, hasAudioBytes ? `groq:${groqModel}(transcript-only)` : `groq:${groqModel}`);
      } catch (e) {
        lastErr = e as Error;
      }
    }

    // 3. Strict mode (used for official results export): never replace an AI evaluation with heuristics.
    if (process.env.EVALUATOR_STRICT === "1") {
      throw new Error(`AI evaluation failed: ${lastErr?.message ?? "no AI provider configured"}`);
    }
    console.warn("AI evaluation unavailable, falling back to heuristic engine:", lastErr?.message);
    const verdicts = await mockEvaluator.evaluate({ conversation, messages, checklist, audio });
    return withRoute(verdicts, "heuristic-fallback");
  },
};
