/**
 * AI #1: Transcript & Audio Analyzer
 *
 * Role: Objectively parses dialogue, timestamps, audio (if present), and extracts
 * structured behavioral facts, timeline events, and verbatim evidence.
 * It DOES NOT judge or apply checklist points — it establishes ground truth.
 */
import { callGemini, parseLlmJson, type GeminiContent, type GeminiPart } from "../ai/geminiClient";
import type { AudioBundle } from "../audio/metrics";
import { describeMetricsRu, type AudioMetrics } from "../audio/prosody";
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
  /** Objective voice measurements from the recording (pitch, pauses, overlaps, loudness); null for chats. */
  acousticMetrics:
    | (Omit<AudioMetrics, "operator" | "client"> & {
        operator: Omit<NonNullable<AudioMetrics["operator"]>, "perUtterance"> | null;
        client: Omit<NonNullable<AudioMetrics["client"]>, "perUtterance"> | null;
      })
    | null;
  analystSummaryRu: string;
}

function formatMessagesForPrompt(messages: MessageDto[]): string {
  return messages
    .map((m) => `[ID:${m.idx} | ${m.timestamp} | ${m.speaker.toUpperCase()}]: ${m.text}`)
    .join("\n");
}

function withoutUtterances<T extends { perUtterance: unknown }>(v: T): Omit<T, "perUtterance"> {
  const { perUtterance: _omit, ...rest } = v;
  return rest;
}

export async function runConversationAnalyzer(
  conversation: ConversationDto,
  messages: MessageDto[],
  audio: AudioBundle | null = null
): Promise<DialogueAnalysisDossier> {
  const parts: GeminiPart[] = [];

  // The recording is downloaded server-side (audio_url may be a player page, not the file itself).
  const audioData =
    audio?.bytes && audio.bytes.byteLength <= 15 * 1024 * 1024
      ? { mimeType: audio.mimeType || "audio/mpeg", data: Buffer.from(audio.bytes).toString("base64") }
      : null;
  const metrics = audio?.metrics ?? null;
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
9. Аудио (если передана аудиозапись): оцени интонацию, темп речи, четкость и перебивания.
10. Объективные голосовые замеры (если переданы): это измерения по самой записи — высота и вариативность интонации, громкость, паузы, наложения речи. Опирайся на них и сверяй со звуком; не выдумывай значения.`;

  const promptText = `Проанализируй следующий диалог:
КАНАЛ: ${conversation.channel}
ЯЗЫК: ${conversation.language}
ДЛИТЕЛЬНОСТЬ: ${conversation.durationSec} сек
AUDIO ПРИСУТСТВУЕТ: ${audioData ? "Да (прикреплено)" : "Нет (только транскрипт)"}
${metrics ? `ОБЪЕКТИВНЫЕ ГОЛОСОВЫЕ ЗАМЕРЫ (по записи):\n${describeMetricsRu(metrics)}\n` : ""}
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
    acousticMetrics: metrics
      ? {
          ...metrics,
          operator: metrics.operator ? withoutUtterances(metrics.operator) : null,
          client: metrics.client ? withoutUtterances(metrics.client) : null,
        }
      : null,
    analystSummaryRu: String(parsed.analystSummaryRu || "Анализ завершен."),
  };
}
