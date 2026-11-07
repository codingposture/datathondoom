// Deterministic multilingual heuristic evaluator (RU / KZ / EN).
// It exists so the whole product flow works without an AI model; swap in an LLM evaluator later.
import { encodeLocalized, type Localized } from "../localized";
import { formatDuration } from "../time";
import type { ChecklistDef, CriterionDef, CriterionVerdict, Lang, MessageDto } from "../types";
import type { Evaluator } from "./types";

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");
const has = (text: string, words: string[]) => {
  const t = norm(text);
  return words.some((w) => t.includes(norm(w)));
};

const WORDS = {
  greeting: ["здравствуйте", "добрый день", "добрый вечер", "доброе утро", "приветствую", "сәлеметсіз", "қайырлы", "hello", "hi,", "hi ", "good morning", "good afternoon", "good evening", "welcome"],
  intro: ["меня зовут", "я —", "на связи", "менің атым", "атым", "i'm ", "i am ", "my name", "this is ", "от поддержки", "поддержка freedom", "from support"],
  clarify: ["уточн", "подскаж", "какой", "какая", "какую", "каком", "где ", "когда", "сколько", "что именно", "правильно понимаю", "which", "what", "when", "where", "how ", "could you", "can you tell", "қай", "қашан", "қанша", "қандай", "қалай", "нақтыла"],
  instruction: ["откройте", "перейдите", "нажмите", "укажите", "проверьте", "напишите", "выберите", "зайдите", "используйте", "отправьте", "сверьте", "начните", "open ", "go to", "tap", "click", "check", "use ", "send", "select", "choose", "enter", "ашыңыз", "басыңыз", "тексеріңіз", "жазыңыз", "қараңыз", "таңдаңыз", "өтіңіз", "жіберіңіз", "қолданыңыз"],
  sensitive: ["пароль", "пин-код", "pin-код", "pin код", "cvv", "cvc", "номер карты полностью", "полный номер карты", "password", "pin code", "full card number", "құпиясөз", "құпия сөз", "карта нөмірін толық", "мне на карту", "на мою карту", "скиньте деньги", "переведите мне", "я сам их вложу", "send me the money", "to my personal card", "маған аударыңыз", "менің картама"],
  polite: ["пожалуйста", "спасибо", "благодарю", "рад помочь", "рада помочь", "please", "thank", "glad to help", "you're welcome", "рақмет", "өтінемін", "өтініш", "оқасы жоқ", "көмектесуге қуаныштымын"],
  empathy: ["понимаю", "извините", "прошу прощения", "к сожалению", "сожалею", "беспоко", "i understand", "sorry", "apolog", "unfortunately", "түсінемін", "кешіріңіз", "өкінішке"],
  rude: ["не мои проблемы", "сами разбирайтесь", "вы что", "читать умеете", "can't you read", "оқи алмайсыз", "не знаю и знать", "отстаньте", "not my problem", "figure it out yourself", "whatever", "менің шаруам емес"],
  waitWarn: ["минуту", "минутку", "секунду", "подождите", "ожидайте", "оставайтесь на линии", "спасибо за ожидание", "благодарю за ожидание", "проверю", "уточню", "moment", "please wait", "hold on", "thanks for waiting", "thank you for waiting", "let me check", "күте тұрыңыз", "күткеніңізге", "тексеремін", "бір минут"],
  escalate: ["передам", "передал", "передаю", "передала", "на проверку", "специалист", "профильн", "escalat", "forward", "pass this", "passed this", "our team will", "specialist", "мамандарға", "маманға", "жолдаймын", "тексеруге жібер", "жібердім"],
  term: ["в течение", "рабоч", "часа", "часов", "дня", "дней", "сегодня", "завтра", "до конца", "within", "hour", "business day", "days", "today", "tomorrow", "сағат", "күн ішінде", "бүгін", "ертең", "жұмыс күні"],
  farewell: ["до свидания", "всего доброго", "хорошего дня", "хорошего вечера", "всего хорошего", "обращайтесь", "goodbye", "bye", "have a good", "have a nice", "take care", "сау болыңыз", "күніңіз сәтті", "қош болыңыз"],
  clientLeft: ["клиент завершил", "клиент покинул", "соединение с клиентом прервано", "клиентпен байланыс үзілді", "клиент чаттан шықты", "connection to customer lost", "customer left", "client left", "customer ended"],
  genericQuestion: ["чем могу помочь", "с чем помочь", "чем помочь", "остались вопросы", "еще вопросы", "дополнительные вопросы", "how can i help", "anything else", "қалай көмектесе", "тағы сұрақ"],
  hold: ["на удержании", "on hold", "күтуде"],
};

// "я Тимур", "мен Дана", "Мен Нұрланмын", redacted names in call transcripts.
const INTRO_RE = /(^|[\s,.!])(я|мен)\s+[А-ЯЁӘҒҚҢӨҰҮҺІ][а-яёәғқңөұүһі]+|\[имя скрыто\]/iu;

type Ctx = {
  lang: Lang;
  messages: MessageDto[];
  ops: MessageDto[];
  range: { from: number; to: number } | null;
};

type Draft = Omit<CriterionVerdict, "criterionId">;

const L = (ru: string, en: string, kz: string): Localized => ({ RU: ru, EN: en, KZ: kz });
const q = (m: MessageDto) => `«${m.text.length > 90 ? m.text.slice(0, 87) + "…" : m.text}»`;
const at = (m: MessageDto) => `[${m.timestamp.length > 8 ? formatDuration(m.offsetSec) : m.timestamp}]`;

function verdict(answer: string, expl: Localized, evidence: MessageDto[], ctx: Ctx, opts: { checked?: boolean; na?: Localized } = {}): Draft {
  return {
    answer,
    explanation: encodeLocalized(expl),
    evidenceIdx: evidence.map((m) => m.idx),
    checkedRange: opts.checked ? ctx.range : null,
    naReason: opts.na ? encodeLocalized(opts.na) : null,
  };
}

function scaleValue(c: CriterionDef, level01: number): string {
  // Maps a 0..1 level onto the criterion's integer scale (handles custom scales from the editor).
  if (c.answerType === "BINARY") return level01 >= 0.5 ? "yes" : "no";
  return String(Math.round(c.scaleMin + (c.scaleMax - c.scaleMin) * level01));
}

function noOperator(c: CriterionDef, ctx: Ctx): Draft {
  const reason = L("Оператор не участвовал в диалоге.", "The operator did not take part in the dialog.", "Оператор диалогқа қатыспады.");
  if (c.naAllowed) return verdict("na", reason, [], ctx, { na: reason });
  return verdict(c.answerType === "BINARY" ? "no" : String(c.scaleMin), reason, [], ctx, { checked: true });
}

const detectors: Record<string, (c: CriterionDef, ctx: Ctx) => Draft> = {
  greeting(c, ctx) {
    const first = ctx.ops[0];
    const g = has(first.text, WORDS.greeting);
    const i = has(first.text, WORDS.intro) || INTRO_RE.test(first.text);
    if (g && i)
      return verdict(scaleValue(c, 1), L(`Оператор поздоровался и представился: ${q(first)}`, `The operator greeted the client and introduced themselves: ${q(first)}`, `Оператор амандасып, өзін таныстырды: ${q(first)}`), [first], ctx);
    const missing = !g && !i ? L("нет ни приветствия, ни имени", "neither a greeting nor a name", "сәлемдесу де, есім де жоқ") : !g ? L("нет приветствия", "no greeting", "сәлемдесу жоқ") : L("оператор не назвал имя", "the operator did not give their name", "оператор атын айтпады");
    return verdict(scaleValue(c, 0), L(`В первом сообщении оператора ${missing.RU}: ${q(first)}`, `The operator's first message has ${missing.EN}: ${q(first)}`, `Оператордың бірінші хабарламасында ${missing.KZ}: ${q(first)}`), [first], ctx, { checked: true });
  },

  need(c, ctx) {
    // Voice transcripts have no punctuation, so a clarifying word alone is enough there.
    const voice = ctx.messages.some((m) => m.timestamp.includes("T"));
    const qs = ctx.ops.filter(
      (m) => !has(m.text, WORDS.genericQuestion) && ((m.text.includes("?") && (has(m.text, WORDS.clarify) || m.text.length < 120)) || (voice && has(m.text, WORDS.clarify))),
    );
    if (qs.length)
      return verdict(scaleValue(c, 1), L(`Оператор уточнил запрос ${at(qs[0])}: ${q(qs[0])}`, `The operator clarified the request ${at(qs[0])}: ${q(qs[0])}`, `Оператор сұранысты нақтылады ${at(qs[0])}: ${q(qs[0])}`), qs.slice(0, 2), ctx);
    const substantive = ctx.ops.filter((m) => m.text.length >= 40);
    if (substantive.length)
      return verdict(scaleValue(c, 0.5), L("Уточняющих вопросов нет, но оператор ответил на исходный запрос клиента.", "No clarifying questions, but the operator answered the client's original request.", "Нақтылау сұрақтары жоқ, бірақ оператор клиенттің бастапқы сұрағына жауап берді."), [substantive[0]], ctx, { checked: true });
    return verdict(scaleValue(c, 0), L("Оператор не выяснил потребность клиента.", "The operator did not identify the client's need.", "Оператор клиенттің қажеттілігін анықтамады."), [], ctx, { checked: true });
  },

  consultation(c, ctx) {
    const substantive = ctx.ops.filter((m) => m.text.length >= 40);
    const instr = ctx.ops.filter((m) => has(m.text, WORDS.instruction));
    if (!substantive.length && !instr.length)
      return verdict(scaleValue(c, 0), L("В сообщениях оператора нет ответа по существу.", "The operator's messages contain no substantive answer.", "Оператор хабарламаларында мәні бойынша жауап жоқ."), [], ctx, { checked: true });
    if (!instr.length)
      return verdict(scaleValue(c, 1 / 3), L("Оператор дал общий ответ без конкретных шагов для клиента.", "The operator gave a general answer without concrete next steps.", "Оператор нақты қадамдарсыз жалпы жауап берді."), substantive.slice(0, 2), ctx, { checked: true });
    if (substantive.length >= 2)
      return verdict(scaleValue(c, 1), L(`Полная консультация с конкретными шагами: ${q(instr[0])}`, `Complete consultation with concrete steps: ${q(instr[0])}`, `Нақты қадамдары бар толық кеңес: ${q(instr[0])}`), instr.slice(0, 2), ctx);
    return verdict(scaleValue(c, 2 / 3), L(`Оператор дал инструкцию, но без пояснений: ${q(instr[0])}`, `The operator gave an instruction without explanation: ${q(instr[0])}`, `Оператор түсіндірмесіз нұсқау берді: ${q(instr[0])}`), [instr[0]], ctx);
  },

  security(c, ctx) {
    const bad = ctx.ops.filter((m) => has(m.text, WORDS.sensitive));
    if (bad.length)
      return verdict(scaleValue(c, 0), L(`Грубая ошибка: нарушение безопасности ${at(bad[0])}: ${q(bad[0])}`, `Critical error: security violation ${at(bad[0])}: ${q(bad[0])}`, `Өрескел қате: қауіпсіздік бұзылды ${at(bad[0])}: ${q(bad[0])}`), bad, ctx);
    return verdict(scaleValue(c, 1), L("Оператор не запрашивал пароль, PIN, CVV или номер карты и не предлагал перевести деньги лично ему. Проверены все сообщения оператора.", "The operator did not ask for a password, PIN, CVV or card number and did not ask for money to be sent to them personally. All operator messages were checked.", "Оператор құпиясөз, PIN, CVV немесе карта нөмірін сұрамады және ақшаны жеке өзіне аударуды ұсынбады. Оператордың барлық хабарламалары тексерілді."), [], ctx, { checked: true });
  },

  politeness(c, ctx) {
    const rude = ctx.ops.filter((m) => has(m.text, WORDS.rude));
    if (rude.length)
      return verdict(scaleValue(c, 0), L(`Некорректный тон: ${q(rude[0])}`, `Inappropriate tone: ${q(rude[0])}`, `Орынсыз сөйлеу мәнері: ${q(rude[0])}`), rude, ctx);
    const polite = ctx.ops.filter((m) => has(m.text, WORDS.polite));
    const empathy = ctx.ops.filter((m) => has(m.text, WORDS.empathy));
    const greeted = has(ctx.ops[0].text, WORDS.greeting);
    if (empathy.length || (polite.length && (greeted || polite.length >= 2))) {
      const ev = [...empathy, ...polite, ctx.ops[0]].slice(0, 2);
      return verdict(scaleValue(c, 1), L(`Вежливые формулировки${empathy.length ? " и эмпатия" : ""}: ${q(ev[0])}`, `Polite wording${empathy.length ? " and empathy" : ""}: ${q(ev[0])}`, `Сыпайы сөздер${empathy.length ? " және эмпатия" : ""}: ${q(ev[0])}`), ev, ctx);
    }
    return verdict(scaleValue(c, 0.5), L("Тон нейтральный, вежливых формулировок мало.", "The tone is neutral, with few polite phrases.", "Сөйлеу мәнері бейтарап, сыпайы сөздер аз."), polite.slice(0, 1), ctx, { checked: true });
  },

  wait(c, ctx) {
    const { messages } = ctx;
    const firstOp = ctx.ops[0].idx;
    const gaps: { from: MessageDto; to: MessageDto; sec: number }[] = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.idx < firstOp || m.speaker !== "client") continue;
      const next = messages.slice(i + 1).find((x) => x.speaker === "operator");
      if (!next) continue;
      const between = messages.slice(i + 1, messages.indexOf(next));
      if (between.some((x) => x.speaker === "client")) continue; // measure only from the last client message
      const sec = next.offsetSec - m.offsetSec;
      if (sec > 60) gaps.push({ from: m, to: next, sec });
    }
    const holds = messages.filter((m) => m.speaker === "system" && has(m.text, WORDS.hold));
    if (!gaps.length && !holds.length) {
      const reason = L("Пауз оператора дольше 60 секунд не было — предупреждать об ожидании не требовалось.", "There were no operator pauses longer than 60 seconds, so no wait warning was needed.", "Оператордың 60 секундтан ұзақ үзілісі болмады — күту туралы ескерту қажет болмады.");
      if (c.naAllowed) return verdict("na", reason, [], ctx, { na: reason });
      return verdict(scaleValue(c, 1), reason, [], ctx, { checked: true });
    }
    const warns = ctx.ops.filter((m) => has(m.text, WORDS.waitWarn));
    if (warns.length)
      return verdict(scaleValue(c, 1), L(`Оператор предупредил об ожидании: ${q(warns[0])}`, `The operator warned the client about the wait: ${q(warns[0])}`, `Оператор күту туралы ескертті: ${q(warns[0])}`), [warns[0]], ctx);
    const g = gaps[0];
    const range = g ? { from: g.from.idx, to: g.to.idx } : ctx.range;
    const p = verdict(scaleValue(c, 0), g ? L(`Пауза ${Math.round(g.sec)} с без предупреждения клиента.`, `A ${Math.round(g.sec)} s pause without warning the client.`, `Клиентті ескертпестен ${Math.round(g.sec)} с үзіліс.`) : L("Клиент был на удержании без предупреждения.", "The client was put on hold without warning.", "Клиент ескертусіз күтуге қойылды."), g ? [g.to] : holds.slice(0, 1), ctx, { checked: true });
    return { ...p, checkedRange: range };
  },

  escalation(c, ctx) {
    const esc = ctx.ops.filter((m) => has(m.text, WORDS.escalate));
    if (!esc.length) {
      const reason = L("Оператор решил вопрос сам, передача специалистам не требовалась.", "The operator resolved the question directly; no hand-off to specialists was needed.", "Оператор мәселені өзі шешті, мамандарға беру қажет болмады.");
      if (c.naAllowed) return verdict("na", reason, [], ctx, { na: reason });
      return verdict(scaleValue(c, 1), reason, [], ctx, { checked: true });
    }
    const withTerm = ctx.ops.filter((m) => m.idx >= esc[0].idx && (has(m.text, WORDS.term) || /до \d{1,2}[:.]\d{2}|\d+\s?(ч|час|мин|h|сағ)/i.test(m.text)));
    if (withTerm.length)
      return verdict(scaleValue(c, 1), L(`Вопрос передан, срок ответа назван: ${q(withTerm[0])}`, `The question was handed off and a response time was given: ${q(withTerm[0])}`, `Сұрақ берілді, жауап мерзімі айтылды: ${q(withTerm[0])}`), [esc[0], withTerm[0]].filter((m, i, a) => a.indexOf(m) === i), ctx);
    return verdict(scaleValue(c, 0), L(`Вопрос передан специалистам, но срок ответа не уточнён: ${q(esc[0])}`, `The question was handed off, but no response time was given: ${q(esc[0])}`, `Сұрақ мамандарға берілді, бірақ жауап мерзімі айтылмады: ${q(esc[0])}`), [esc[0]], ctx, { checked: true });
  },

  closing(c, ctx) {
    const last = ctx.ops[ctx.ops.length - 1];
    const bye = ctx.ops.filter((m) => has(m.text, WORDS.farewell));
    if (bye.length) {
      const b = bye[bye.length - 1];
      return verdict(scaleValue(c, 1), L(`Оператор корректно завершил диалог: ${q(b)}`, `The operator closed the dialog properly: ${q(b)}`, `Оператор диалогты дұрыс аяқтады: ${q(b)}`), [b], ctx);
    }
    const left = ctx.messages.filter((m) => m.speaker === "system" && has(m.text, WORDS.clientLeft));
    const clientTail = ctx.messages.slice(last.idx + 1).some((m) => m.speaker === "client");
    if ((left.length || clientTail) && c.naAllowed) {
      const reason = left.length
        ? L(`Клиент покинул диалог до завершения: ${q(left[0])}`, `The client left before the dialog was closed: ${q(left[0])}`, `Клиент диалог аяқталмай тұрып шығып кетті: ${q(left[0])}`)
        : L("Диалог оборвался на сообщении клиента — оператор не успел завершить его.", "The dialog ended on a client message; the operator had no chance to close it.", "Диалог клиент хабарламасымен үзілді — оператор аяқтап үлгермеді.");
      return verdict("na", reason, left.slice(0, 1), ctx, { na: reason });
    }
    return verdict(scaleValue(c, 0), L(`Оператор не попрощался и не подвёл итог. Последнее сообщение оператора: ${q(last)}`, `The operator neither said goodbye nor summarised. Last operator message: ${q(last)}`, `Оператор қоштаспады және қорытынды жасамады. Оператордың соңғы хабарламасы: ${q(last)}`), [last], ctx, { checked: true });
  },

  keywords(c, ctx) {
    const kws = keywordsFor(c, ctx.lang);
    if (!kws.length) return verdict(c.naAllowed ? "na" : scaleValue(c, 0), noKeywords, [], ctx, c.naAllowed ? { na: noKeywords } : { checked: true });
    const hit = ctx.ops.filter((m) => has(m.text, kws));
    if (hit.length)
      return verdict(scaleValue(c, 1), L(`Требуемая формулировка найдена: ${q(hit[0])}`, `The required wording was found: ${q(hit[0])}`, `Қажетті тұжырым табылды: ${q(hit[0])}`), hit.slice(0, 2), ctx);
    return verdict(scaleValue(c, 0), L(`Оператор не использовал ни одну из формулировок: ${kws.slice(0, 4).join(", ")}.`, `The operator used none of the expected phrases: ${kws.slice(0, 4).join(", ")}.`, `Оператор күтілген тұжырымдардың ешқайсысын қолданбады: ${kws.slice(0, 4).join(", ")}.`), [], ctx, { checked: true });
  },

  keywords_absent(c, ctx) {
    const kws = keywordsFor(c, ctx.lang);
    const hit = kws.length ? ctx.ops.filter((m) => has(m.text, kws)) : [];
    if (hit.length)
      return verdict(scaleValue(c, 0), L(`Запрещённая формулировка: ${q(hit[0])}`, `Prohibited wording: ${q(hit[0])}`, `Тыйым салынған тұжырым: ${q(hit[0])}`), hit, ctx);
    return verdict(scaleValue(c, 1), L("Запрещённых формулировок не найдено. Проверены все сообщения оператора.", "No prohibited wording found. All operator messages were checked.", "Тыйым салынған тұжырымдар табылмады. Оператордың барлық хабарламалары тексерілді."), [], ctx, { checked: true });
  },
};

const noKeywords = L("Для критерия не заданы ключевые слова — автоматическая проверка невозможна.", "No keywords are configured for this criterion, so it cannot be checked automatically.", "Критерий үшін кілт сөздер берілмеген — автоматты тексеру мүмкін емес.");

function keywordsFor(c: CriterionDef, lang: Lang): string[] {
  const k = c.hints.keywords ?? {};
  const own = (k[lang] ?? []).filter(Boolean);
  if (own.length) return own;
  return Object.values(k).flat().filter((x): x is string => Boolean(x));
}

/** Picks a detector for criteria created in the UI without an explicit one. */
function detectorFor(c: CriterionDef): string {
  if (c.hints.detector && detectors[c.hints.detector]) return c.hints.detector;
  return "keywords";
}

export const mockEvaluator: Evaluator = {
  name: "mock-heuristic-v1",
  async evaluate({ conversation, messages, checklist }: { conversation: { language: Lang }; messages: MessageDto[]; checklist: ChecklistDef }) {
    const ops = messages.filter((m) => m.speaker === "operator");
    const ctx: Ctx = {
      lang: conversation.language,
      messages,
      ops,
      range: ops.length ? { from: ops[0].idx, to: messages[messages.length - 1].idx } : null,
    };
    return [...checklist.criteria]
      .sort((a, b) => a.order - b.order)
      .map((c) => {
        const p = ops.length ? detectors[detectorFor(c)](c, ctx) : noOperator(c, ctx);
        // Respect the checklist: never return N/A when it is not allowed.
        if (p.answer === "na" && !c.naAllowed) return { criterionId: c.id, ...p, answer: scaleValue(c, 1), naReason: null };
        return { criterionId: c.id, ...p };
      });
  },
};
