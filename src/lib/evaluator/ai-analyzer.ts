/**
 * AI #1: Transcript & Audio Analyzer
 *
 * Role: Objectively parses dialogue, timestamps, audio (if present), and extracts
 * structured behavioral facts, timeline events, and verbatim evidence.
 * It DOES NOT judge or apply checklist points — it establishes ground truth.
 */
import { callGemini, parseLlmJson, type GeminiContent, type GeminiPart } from "../ai/geminiClient";
import type { ConversationDto, MessageDto } from "../types";

export interface PauseEvent {
  fromIdx: number;
  toIdx: number;
  durationSec: number;
  clientMsg: string;
  operatorResponseMsg: string;
}

export interface SecurityIncident {
  msgIdx: number;
  text: string;
  type: "password" | "pin" | "cvv" | "full_card" | "personal_transfer" | "other";
  description: string;
}

export interface AudioObservation {
  speechPace: "fast" | "normal" | "slow" | "unclear";
  tone: "friendly" | "neutral" | "irritated" | "monotonous";
  interruptions: boolean;
  audibility: "clear" | "muffled" | "noisy";
  notes: string;
}

export interface DialogueAnalysisDossier {
  conversationId: string;
  channel: string;
  language: string;
  durationSec: number;
  totalMessages: number;
  operatorPresent: boolean;

  // Key milestones
  greeting: {
    found: boolean;
    operatorFirstMsgIdx: number | null;
    greetingText: string | null;
    introducedName: boolean;
    nameDetected: string | null;
    evidenceIdx: number[];
  };

  needIdentification: {
    clientCoreRequest: string;
    clarifyingQuestions: Array<{ msgIdx: number; text: string }>;
    evidenceIdx: number[];
  };

  consultation: {
    providedSubstantiveAnswer: boolean;
    instructionsOrStepsGiven: string[];
    completenessSummary: string;
    evidenceIdx: number[];
  };

  security: {
    violationsDetected: boolean;
    incidents: SecurityIncident[];
  };

  politenessAndTone: {
    overallTone: "polite_empathetic" | "neutral" | "rude_unprofessional";
    empathyDemonstrated: boolean;
    politePhrases: string[];
    rudePhrases: string[];
    evidenceIdx: number[];
  };

  waitAndPauses: {
    pausesOver60s: PauseEvent[];
    longestPauseSec: number;
    warnedBeforeWaiting: boolean;
    warningEvidenceIdx: number[];
  };

  escalation: {
    escalatedToSpecialist: boolean;
    timeframeOrDeadlineGiven: boolean;
    deadlineMentioned: string | null;
    evidenceIdx: number[];
  };

  closing: {
    properFarewellGiven: boolean;
    summaryGiven: boolean;
    clientLeftEarly: boolean;
    evidenceIdx: number[];
  };

  audioAnalysis: AudioObservation | null;
  analystSummaryRu: string;
}

function formatMessagesForPrompt(messages: MessageDto[]): string {
  return messages
    .map((m) => `[ID:${m.idx} | ${m.timestamp} | ${m.speaker.toUpperCase()}]: ${m.text}`)
    .join("\n");
}

/**
 * Optionally try to fetch audio as base64 for Gemini multimodal analysis if audioUrl is present.
 */
async function tryFetchAudioBase64(audioUrl: string | null): Promise<{ mimeType: string; data: string } | null> {
  if (!audioUrl) return null;
  try {
    const res = await fetch(audioUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    // Limit to 15MB to avoid memory/payload bloat
    if (arrayBuffer.byteLength > 15 * 1024 * 1024) return null;
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = res.headers.get("content-type") || "audio/mp3";
    return { mimeType, data: base64 };
  } catch {
    return null;
  }
}

export async function runConversationAnalyzer(
  conversation: ConversationDto,
  messages: MessageDto[]
): Promise<DialogueAnalysisDossier> {
  const parts: GeminiPart[] = [];

  // Check if we can include audio data
  const audioData = await tryFetchAudioBase64(conversation.audioUrl);
  if (audioData) {
    parts.push({
      inlineData: {
        mimeType: audioData.mimeType,
        data: audioData.data,
      },
    });
  }

  const systemInstruction = `Ты — ведущий эксперт-аналитик отдела контроля качества клиентского сервиса (AI #1: Analyzer).
Твоя задача — объективно, беспристрастно и скрупулезно проанализировать диалог (текст сообщений, таймкоды, спикеров и аудиозапись при наличии).

ВАЖНО:
- Твоя цель — собрать ФАКТЫ и ДОКАЗАТЕЛЬСТВА (номера реплик ID, цитаты, замеры времени).
- Ты НЕ выставляешь итоговые баллы (этим займется AI #2: Judge).
- Оценивай действия ТОЛЬКО оператора (operator). Бот (bot), клиент (client) и система (system) являются контекстом.
- Все текстовые описания и резюме пиши на русском языке.

Особое внимание обрати на:
1. Приветствие: Поздоровался ли оператор? Назвал ли свое имя (например, "меня зовут ...", "я ...") в первом сообщении?
2. Выявление потребности: Задал ли оператор уточняющие вопросы по ситуации клиента?
3. Полнота консультации: Дал ли понятный ответ по существу, инструкции или алгоритм действий?
4. Безопасность (КРИТИЧНО): Требовал ли оператор пароли, PIN-коды, CVV/CVC, полный номер карты или предлагал перевести деньги на свою личную карту?
5. Вежливость и тон: Были ли вежливые слова ("пожалуйста", "спасибо"), эмпатия ("понимаю ваше беспокойство", "приносим извинения") или грубость ("сами разбирайтесь", "не мои проблемы")?
6. Паузы и ожидание: Были ли задержки с ответом оператора более 60 секунд? Предупредил ли оператор клиента перед уходом на поиск информации ("минуту, уточню", "пожалуйста, подождите")?
7. Передача вопроса (эскалация): Если вопрос передавался коллегам/в бэк-офис, был ли четко назван срок ответа (например, "в течение 24 часов", "до конца рабочего дня")?
8. Завершение: Попрощался ли оператор корректно? Или клиент сам прервал диалог/покинул чат до завершения?
9. Аудио (если передана аудиозапись): оцени интонацию, темп речи, четкость и перебивания.`;

  const promptText = `Проанализируй следующий диалог:
КАНАЛ: ${conversation.channel}
ЯЗЫК: ${conversation.language}
ДЛИТЕЛЬНОСТЬ: ${conversation.durationSec} сек
AUDIO ПРИСУТСТВУЕТ: ${audioData ? "Да (прикреплено)" : "Нет (только транскрипт)"}

ТРАНСКРИПТ:
${formatMessagesForPrompt(messages)}

Верни результат СТРОГО в формате JSON со следующей структурой:
{
  "operatorPresent": true,
  "greeting": {
    "found": true,
    "operatorFirstMsgIdx": 1,
    "greetingText": "Здравствуйте! Меня зовут...",
    "introducedName": true,
    "nameDetected": "Имя",
    "evidenceIdx": [1]
  },
  "needIdentification": {
    "clientCoreRequest": "Краткая суть запроса клиента",
    "clarifyingQuestions": [{"msgIdx": 3, "text": "Уточните пожалуйста..."}],
    "evidenceIdx": [3]
  },
  "consultation": {
    "providedSubstantiveAnswer": true,
    "instructionsOrStepsGiven": ["Шаг 1...", "Шаг 2..."],
    "completenessSummary": "Оператор дал исчерпывающий ответ...",
    "evidenceIdx": [5, 7]
  },
  "security": {
    "violationsDetected": false,
    "incidents": []
  },
  "politenessAndTone": {
    "overallTone": "polite_empathetic", // polite_empathetic | neutral | rude_unprofessional
    "empathyDemonstrated": true,
    "politePhrases": ["пожалуйста", "рад помочь"],
    "rudePhrases": [],
    "evidenceIdx": [1, 9]
  },
  "waitAndPauses": {
    "pausesOver60s": [],
    "longestPauseSec": 25,
    "warnedBeforeWaiting": true,
    "warningEvidenceIdx": []
  },
  "escalation": {
    "escalatedToSpecialist": false,
    "timeframeOrDeadlineGiven": false,
    "deadlineMentioned": null,
    "evidenceIdx": []
  },
  "closing": {
    "properFarewellGiven": true,
    "summaryGiven": false,
    "clientLeftEarly": false,
    "evidenceIdx": [11]
  },
  "audioAnalysis": ${
    audioData
      ? `{
    "speechPace": "normal",
    "tone": "friendly",
    "interruptions": false,
    "audibility": "clear",
    "notes": "Четкая дикция, доброжелательный тон"
  }`
      : "null"
  },
  "analystSummaryRu": "Развернутое резюме по диалогу в 2-4 предложениях."
}`;

  parts.push({ text: promptText });

  const contents: GeminiContent[] = [{ role: "user", parts }];

  const rawJson = await callGemini({
    systemInstruction,
    contents,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const parsed = parseLlmJson<Record<string, unknown>>(rawJson);

  return {
    conversationId: conversation.id,
    channel: conversation.channel,
    language: conversation.language,
    durationSec: conversation.durationSec,
    totalMessages: messages.length,
    operatorPresent: Boolean(parsed.operatorPresent ?? true),
    greeting: (parsed.greeting as DialogueAnalysisDossier["greeting"]) || {
      found: false,
      operatorFirstMsgIdx: null,
      greetingText: null,
      introducedName: false,
      nameDetected: null,
      evidenceIdx: [],
    },
    needIdentification: (parsed.needIdentification as DialogueAnalysisDossier["needIdentification"]) || {
      clientCoreRequest: "",
      clarifyingQuestions: [],
      evidenceIdx: [],
    },
    consultation: (parsed.consultation as DialogueAnalysisDossier["consultation"]) || {
      providedSubstantiveAnswer: false,
      instructionsOrStepsGiven: [],
      completenessSummary: "",
      evidenceIdx: [],
    },
    security: (parsed.security as DialogueAnalysisDossier["security"]) || {
      violationsDetected: false,
      incidents: [],
    },
    politenessAndTone: (parsed.politenessAndTone as DialogueAnalysisDossier["politenessAndTone"]) || {
      overallTone: "neutral",
      empathyDemonstrated: false,
      politePhrases: [],
      rudePhrases: [],
      evidenceIdx: [],
    },
    waitAndPauses: (parsed.waitAndPauses as DialogueAnalysisDossier["waitAndPauses"]) || {
      pausesOver60s: [],
      longestPauseSec: 0,
      warnedBeforeWaiting: false,
      warningEvidenceIdx: [],
    },
    escalation: (parsed.escalation as DialogueAnalysisDossier["escalation"]) || {
      escalatedToSpecialist: false,
      timeframeOrDeadlineGiven: false,
      deadlineMentioned: null,
      evidenceIdx: [],
    },
    closing: (parsed.closing as DialogueAnalysisDossier["closing"]) || {
      properFarewellGiven: false,
      summaryGiven: false,
      clientLeftEarly: false,
      evidenceIdx: [],
    },
    audioAnalysis: (parsed.audioAnalysis as AudioObservation | null) || null,
    analystSummaryRu: String(parsed.analystSummaryRu || "Анализ завершен."),
  };
}
