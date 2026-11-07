import { z } from "zod";
import { handle } from "@/lib/api";
import { callGroq, getGroqApiKey, parseLlmJson } from "@/lib/ai/groqClient";
import { callGemini } from "@/lib/ai/geminiClient";
import { prisma } from "@/lib/db";
import { loadConversation, HttpError } from "@/lib/services";
import { toEvaluationDto } from "@/lib/mappers";

export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
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

  const url = new URL(req.url);
  const reqLang = url.searchParams.get("lang")?.toUpperCase();
  const convLang = (conversation.language || "ru").toLowerCase();
  const isEn = reqLang === "EN" || (!reqLang && convLang === "en");
  const isKz = reqLang === "KZ" || (!reqLang && (convLang === "kz" || convLang === "kk"));

  const lowered = evaluation.results.filter(
    (r) => r.finalAnswer !== "na" && r.finalPoints < r.finalMaxPoints
  );

  const transcript = messages
    .map((m) => `[${m.idx}] ${m.speaker.toUpperCase()}: ${m.text}`)
    .join("\n");

  const issuesSummary = lowered
    .map((r) => `- Критерий ${r.code}: ответ "${r.finalAnswer}", набрано ${r.finalPoints}/${r.finalMaxPoints}. Обоснование: ${r.explanation}`)
    .join("\n");

  const systemInstruction = isEn
    ? `You are an experienced quality assurance (QA) supervisor and coach at Freedom Broker.
Your task is to provide constructive, encouraging, and practical coaching recommendations for the customer support operator based on this dialogue analysis.

CRITICAL REQUIREMENTS:
- Language: English. ALL feedback, strengths, advice, and scripts MUST be in English.
- Tone: professional, motivating, constructive (Sandwich feedback: positive reinforcement -> growth areas -> encouragement).
- Speech scripts: Provide natural, clear English phrases tailored to Freedom Broker financial support.

Response format STRICTLY JSON:
{
  "generalFeedback": "Summary feedback for the operator in 2-3 sentences",
  "strengths": ["What the operator did well (1-3 bullet points)"],
  "actionableTips": [
    {
      "criterionCode": "C1",
      "title": "Greeting and introduction",
      "issue": "What went wrong in the dialogue",
      "advice": "Actionable advice on how to handle this better",
      "exampleScript": "“Exact phrase to say”"
    }
  ],
  "idealScriptExample": "Example of an ideal response or key utterance tailored for this situation"
}`
    : isKz
    ? `Сіз — Freedom Broker сапаны бақылау (QA) бөлімінің тәжірибелі супервайзері және коучысыз.
Сіздің міндетіңіз — диалог нәтижелері бойынша операторға сындарлы, жігерлендіретін және пайдалы ұсыныстар беру.

МАҢЫЗДЫ ТАЛАПТАР:
- Тіл: Қазақ тілі. Барлық пікірлер, кеңестер, мықты тұстары және скрипттер ҚАЗАҚ ТІЛІНДЕ болуы МІНДЕТТІ.
- Тон: кәсіби, жігерлендіретін, сындарлы (мақтау -> даму аймақтары -> қолдау).
- Нақты сөйлеу модульдерін (скрипттерін) беріңіз.

Жауап форматы ҚАТАҢ ТҮРДЕ JSON:
{
  "generalFeedback": "Оператор жұмысы туралы 2-3 сөйлемнен тұратын жалпы пікір",
  "strengths": ["Оператор не жақсы істеді (1-3 тармақ)"],
  "actionableTips": [
    {
      "criterionCode": "C1",
      "title": "Сәлемдесу және таныстыру",
      "issue": "Диалогта қандай қателік болды",
      "advice": "Түзету үшін нақты кеңес",
      "exampleScript": "«Айтылуы тиіс нақты сөз тіркесі/скрипт»"
    }
  ],
  "idealScriptExample": "Осы жағдайға арналған эталондық жауаптың үлгісі"
}`
    : `Ты — опытный супервайзер и коуч отдела контроля качества (QA) Freedom Broker.
Твоя задача — составить конструктивные, доброжелательные и практичные рекомендации для оператора по итогам диалога.

ВАЖНО:
- Тон: профессиональный, мотивирующий, конструктивный (Sandwich feedback: похвала -> зоны роста -> поддержка).
- Язык: русский. Все замечания, советы и речевые модули строго на русском языке.
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

  const promptText = isEn
    ? `TRANSCRIPT OF DIALOGUE (${conversation.channel}, language: ${conversation.language}):
${transcript}

TOTAL SCORE: ${evaluation.finalTotal} / 100
DETECTED ISSUES:
${issuesSummary || "No issues detected, all criteria fully satisfied."}`
    : isKz
    ? `ДИАЛОГ ТРАНСКРИПТІ (${conversation.channel}, тілі: ${conversation.language}):
${transcript}

ҚОРЫТЫНДЫ БАЛЛ: ${evaluation.finalTotal} / 100
АНЫҚТАЛҒАН ЕСКЕРТУЛЕР:
${issuesSummary || "Ескертулер жоқ, барлық критерийлер толық орындалды."}`
    : `ТРАНСКРИПТ ДИАЛОГА (${conversation.channel}, язык: ${conversation.language}):
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
    if (isEn) {
      parsed = {
        generalFeedback: evaluation.finalTotal >= 85
          ? "The operator demonstrated good communication skills, respectful attitude, and helpful guidance."
          : "The operator is advised to focus on clarifying customer needs and following Freedom Broker standard communication scripts.",
        strengths: evaluation.results
          .filter((r) => r.finalPoints >= r.finalMaxPoints && r.finalMaxPoints > 0)
          .slice(0, 3)
          .map((r) => `Adherence to standard ${r.code}`),
        actionableTips: lowered.map((r) => ({
          criterionCode: r.code,
          title: `Criterion ${r.code}`,
          issue: r.explanation || "Score was reduced during quality assessment.",
          advice: "Follow Freedom Broker support guidelines and verify all details with the client.",
          exampleScript: "“I will be happy to answer any further questions regarding your account.”",
        })),
        idealScriptExample: "“Hello! My name is [Name], Freedom Broker support. How can I assist you today?” ... “Always here to help, have a wonderful day!”",
      };
    } else if (isKz) {
      parsed = {
        generalFeedback: evaluation.finalTotal >= 85
          ? "Оператор клиентпен сыпайы сөйлесіп, қажетті ақпаратты сауатты жеткізді."
          : "Операторға клиенттің сұрауын нақтылауға және Freedom Broker стандарттарын сақтауға назар аудару ұсынылады.",
        strengths: evaluation.results
          .filter((r) => r.finalPoints >= r.finalMaxPoints && r.finalMaxPoints > 0)
          .slice(0, 3)
          .map((r) => `${r.code} стандартын орындау`),
        actionableTips: lowered.map((r) => ({
          criterionCode: r.code,
          title: `${r.code} критерийі`,
          issue: r.explanation || "Сапаны бағалау кезінде балл төмендетілді.",
          advice: "Freedom Broker қызмет көрсету регламентін қатаң сақтаңыз.",
          exampleScript: "«Шотыңыз бойынша кез келген қосымша сұрақтарға жауап беруге қуаныштымын.»",
        })),
        idealScriptExample: "«Сәлеметсіз бе! Менің атым [Есім], Freedom Broker қолдау қызметі. Қалай көмектесе аламын?» ... «Күніңіз сәтті өтсін!»",
      };
    } else {
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
  }

  return parsed;
});
