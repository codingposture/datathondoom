import { z } from "zod";
import { handle } from "@/lib/api";
import { callGroq, getGroqApiKey, parseLlmJson } from "@/lib/ai/groqClient";
import { callGemini } from "@/lib/ai/geminiClient";
import { prisma } from "@/lib/db";
import { loadConversation, HttpError } from "@/lib/services";
import { toEvaluationDto } from "@/lib/mappers";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const decodedId = decodeURIComponent(id);

  const { conversation, messages } = await loadConversation(decodedId);
  const evalRow = await prisma.evaluation.findFirst({
    where: { conversationId: decodedId },
    orderBy: { createdAt: "desc" },
    include: { results: true, appeals: true },
  });

  if (!evalRow) {
    throw new HttpError(400, "Dialogue must be evaluated first before generating recommendations.");
  }

  const evaluation = toEvaluationDto(evalRow);

  const lowered = evaluation.results.filter(
    (r) => r.finalAnswer !== "na" && r.finalPoints < r.finalMaxPoints
  );

  const transcript = messages
    .map((m) => `[${m.idx}] ${m.speaker.toUpperCase()}: ${m.text}`)
    .join("\n");

  const issuesSummary = lowered
    .map((r) => `- Критерий ${r.code}: ответ "${r.finalAnswer}", набрано ${r.finalPoints}/${r.finalMaxPoints}. Обоснование: ${r.explanation}`)
    .join("\n");

  const systemInstruction = `Ты — опытный супервайзер и коуч отдела контроля качества (QA) Freedom Broker.
Твоя задача — составить конструктивные, доброжелательные и практичные рекомендации для оператора по итогам диалога.

ВАЖНО:
- Тон: профессиональный, мотивирующий, конструктивный (Sandwich feedback: похвала -> зоны роста -> поддержка).
- Язык: русский.
- Дай конкретные речевые модули (фразы), которые оператор может использовать в следующий раз.

Формат ответа СТРОГО JSON:
{
  "generalFeedback": "Общий отзыв о работе оператора в 2-3 предложениях",
  "strengths": ["Что оператор сделал хорошо (1-3 пункта)"],
  "actionableTips": [
    {
      "criterionCode": "C1",
      "title": "Приветствие и имя",
      "issue": "В чем была ошибка в диалоге",
      "advice": "Что нужно сделать для исправления",
      "exampleScript": "«Точный скрипт фразы, которую нужно говорить»"
    }
  ],
  "idealScriptExample": "Пример идеальной реплики или ключевого ответа для этой ситуации"
}`;

  const promptText = `ТРАНСКРИПТ ДИАЛОГА (${conversation.channel}, язык: ${conversation.language}):
${transcript}

ИТОГОВЫЙ БАЛЛ: ${evaluation.finalTotal} / 100
ОБНАРУЖЕННЫЕ ЗАМЕЧАНИЯ:
${issuesSummary || "Замечаний нет, все критерии выполнены на максимум."}`;

  let parsed: Record<string, unknown>;
  const hasGroq = Boolean(getGroqApiKey());

  try {
    let rawJson: string;
    if (hasGroq) {
      try {
        rawJson = await callGroq({
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: promptText },
          ],
          jsonMode: true,
          temperature: 0.2,
        });
      } catch {
        rawJson = await callGemini({
          systemInstruction,
          contents: [{ role: "user", parts: [{ text: promptText }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        });
      }
    } else {
      rawJson = await callGemini({
        systemInstruction,
        contents: [{ role: "user", parts: [{ text: promptText }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      });
    }

    parsed = parseLlmJson<Record<string, unknown>>(rawJson);
  } catch (err) {
    // Graceful fallback if both external AI providers are throttling or offline
    parsed = {
      generalFeedback: evaluation.finalTotal >= 85
        ? "Оператор продемонстрировал уверенное владение материалом и корректный тон общения с клиентом."
        : "Оператору рекомендуется уделить внимание соблюдению корпоративных стандартов и работе со сложными кейсами.",
      strengths: evaluation.results
        .filter((r) => r.finalPoints >= r.finalMaxPoints && r.finalMaxPoints > 0)
        .slice(0, 3)
        .map((r) => `Соблюдение стандарта ${r.code}`),
      actionableTips: lowered.map((r) => ({
        criterionCode: r.code,
        title: `Критерий ${r.code}`,
        issue: r.explanation || "Балл снижен при оценке качества диалога.",
        advice: "Следуйте утвержденному регламенту обслуживания Freedom Broker и фиксируйте ключевую информацию.",
        exampleScript: "«Буду рад ответить на любые дополнительные вопросы по вашему счету.»",
      })),
      idealScriptExample: "«Здравствуйте! Меня зовут [Имя], Freedom Broker. Чем могу вам помочь?» ... «Всегда на связи, хорошего вам дня!»",
    };
  }

  return parsed;
});
