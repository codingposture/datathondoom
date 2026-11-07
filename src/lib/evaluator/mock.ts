// Deterministic multilingual heuristic evaluator (RU / KZ / EN).
// It exists so the whole product flow works without an AI model; swap in an LLM evaluator later.
import { encodeLocalized, type Localized } from "../localized";
import { formatDuration } from "../time";
import type { ChecklistDef, CriterionDef, CriterionVerdict, Lang, MessageDto } from "../types";
import type { AudioBundle } from "../audio/metrics";
import type { AudioMetrics } from "../audio/prosody";
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
  interruptApology: ["перебил", "перебиваю", "перебила", "перебью", "interrupt", "сөзіңізді бөлгенім", "бөлгенім үшін"],
  complaint: ["уже час", "почти час", "сколько можно", "сколько ждать", "безобразие", "возмутительно", "недоволен", "недовольна", "жалоб", "почему так долго", "опять", "снова не", "не работает", "ужас", "this is ridiculous", "unacceptable", "again", "complain", "still not", "қашанға дейін", "шағым", "тағы да"],
};

// ---------- voice criteria (calls) ----------
// Thresholds calibrated on the 5 DEV recordings: pitch variation inside phrases ranged 2.06–3.68 semitones.
export const VOICE_THRESHOLDS = {
  steadyBelowSt: 2.2, // < 2.2 st pitch variation inside phrases → steady, calm voice (best)
  swingFromSt: 3.0, // ≥ 3.0 st → strong pitch swings (worst)
  deadAirSec: 5, // silence the operator owes a reply for
  slowMedianLatencySec: 3, // median response latency considered slow
  upsetArousal: 1.2, // client phrase arousal (z) considered agitated
  raisedDb: 6, // operator louder than own median by ≥ 6 dB…
  raisedSt: 3, // …and higher by ≥ 3 semitones
};

// "я Тимур", "мен Дана", "Мен Нұрланмын", redacted names in call transcripts.
const INTRO_RE = /(^|[\s,.!])(я|мен)\s+[А-ЯЁӘҒҚҢӨҰҮҺІ][а-яёәғқңөұүһі]+|\[имя скрыто\]/iu;

type Ctx = {
  lang: Lang;
  messages: MessageDto[];
  ops: MessageDto[];
  range: { from: number; to: number } | null;
  /** Voice metrics measured from the call recording; null for chats or when analysis failed. */
  audio: AudioMetrics | null;
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

  voice_intonation(c, ctx) {
    // Goal: a steady, calm, even voice. Large pitch swings inside phrases score lowest.
    const v = ctx.audio?.operator;
    if (!v) return noVoice(c, ctx);
    const x = v.withinUttF0SdSt;
    const T = VOICE_THRESHOLDS;
    const nums = `${x} пт; диапазон ${v.f0RangeSt} пт; ${v.utterances} фраз`;
    const numsEn = `${x} st; range ${v.f0RangeSt} st; ${v.utterances} phrases`;
    // Evidence: the most variable phrases when the voice is not steady, the steadiest ones otherwise.
    const ev = [...v.perUtterance].sort((a, b) => (x < T.steadyBelowSt ? a.f0SdSt - b.f0SdSt : b.f0SdSt - a.f0SdSt)).slice(0, 2);
    const evMsgs = ev.map((u) => ctx.messages.find((m) => m.idx === u.idx)).filter((m): m is MessageDto => Boolean(m));
    if (x < T.steadyBelowSt)
      return verdict(scaleValue(c, 1), L(`Ровный, спокойный голос: высота голоса внутри фраз меняется мало (${nums}; ровно < ${T.steadyBelowSt} пт).`, `Steady, calm voice: pitch varies little within phrases (${numsEn}; steady below ${T.steadyBelowSt} st).`, `Бірқалыпты, сабырлы дауыс: фразалар ішінде дауыс биіктігі аз өзгереді (${nums}; бірқалыпты < ${T.steadyBelowSt} пт).`), evMsgs, ctx);
    if (x < T.swingFromSt)
      return verdict(scaleValue(c, 0.5), L(`Голос в целом ровный, но местами заметно меняется по высоте: вариативность ${nums} (ровно < ${T.steadyBelowSt} пт).`, `Mostly steady voice with noticeable pitch changes in places: variation ${numsEn} (steady below ${T.steadyBelowSt} st).`, `Дауыс негізінен бірқалыпты, бірақ кей жерде биіктігі айтарлықтай өзгереді: ${nums} (бірқалыпты < ${T.steadyBelowSt} пт).`), evMsgs, ctx, { checked: true });
    return verdict(scaleValue(c, 0), L(`Неровный голос: сильные перепады высоты голоса внутри фраз (${nums}; перепады ≥ ${T.swingFromSt} пт).`, `Uneven voice: strong pitch swings within phrases (${numsEn}; swings from ${T.swingFromSt} st).`, `Дауыс бірқалыпты емес: фразалар ішінде дауыс биіктігі қатты құбылады (${nums}; ≥ ${T.swingFromSt} пт).`), evMsgs, ctx, { checked: true });
  },

  voice_interruptions(c, ctx) {
    const a = ctx.audio;
    if (!a) return noVoice(c, ctx);
    const byIdx = (i: number) => ctx.messages.find((m) => m.idx === i);
    const apology = ctx.ops.filter((m) => has(m.text, WORDS.interruptApology));
    const overlaps = a.overlaps;
    if (!overlaps.length && !apology.length)
      return verdict(scaleValue(c, 1), L("Оператор не перебивал клиента: наложений речи оператора на реплики клиента (≥ 1 с) в записи не найдено.", "The operator did not interrupt: no operator speech over the client (≥ 1 s) was found in the recording.", "Оператор клиенттің сөзін бөлмеді: жазбада оператордың клиент сөзімен қабаттасуы (≥ 1 с) табылмады."), [], ctx, { checked: true });
    const ev = [...overlaps.map((o) => byIdx(o.operatorIdx)), ...apology].filter((m, i, arr): m is MessageDto => Boolean(m) && arr.indexOf(m) === i);
    const parts: string[] = [];
    const partsEn: string[] = [];
    for (const o of overlaps) {
      parts.push(`реплика #${o.operatorIdx} началась поверх речи клиента #${o.clientIdx} (наложение ${o.overlapSec} с)`);
      partsEn.push(`message #${o.operatorIdx} started over the client's #${o.clientIdx} (${o.overlapSec} s overlap)`);
    }
    if (apology.length) {
      parts.push(`оператор сам извинился за то, что перебил: ${q(apology[0])}`);
      partsEn.push(`the operator apologised for interrupting: ${q(apology[0])}`);
    }
    return verdict(scaleValue(c, 0), L(`Оператор перебивал клиента: ${parts.join("; ")}.`, `The operator interrupted the client: ${partsEn.join("; ")}.`, `Оператор клиенттің сөзін бөлді: ${parts.join("; ")}.`), ev, ctx);
  },

  voice_pace(c, ctx) {
    const a = ctx.audio;
    if (!a) return noVoice(c, ctx);
    const T = VOICE_THRESHOLDS;
    const byIdx = (i: number | null) => (i === null ? undefined : ctx.messages.find((m) => m.idx === i));
    // Dead air the operator owes: the next speaker after the silence is the operator, not during a hold,
    // and the operator had not warned about the wait just before.
    const owed = a.silences.filter((s) => {
      if (s.duringHold || s.durSec < T.deadAirSec) return false;
      const after = byIdx(s.afterIdx);
      const before = byIdx(s.beforeIdx);
      if (after?.speaker !== "operator") return false;
      if (before?.speaker === "operator" && has(before.text, WORDS.waitWarn)) return false;
      return true;
    });
    const lat = a.responseLatency.medianSec;
    const slow = lat !== null && lat > T.slowMedianLatencySec;
    if (!owed.length && !slow)
      return verdict(scaleValue(c, 1), L(`Темп разговора в норме: медианная задержка ответа оператора ${lat ?? "—"} с, необъяснённых пауз ≥ ${T.deadAirSec} с нет.`, `Conversation pace is fine: median operator response delay ${lat ?? "—"} s, no unexplained pauses ≥ ${T.deadAirSec} s.`, `Әңгіме қарқыны қалыпты: оператор жауабының медиандық кідірісі ${lat ?? "—"} с, ${T.deadAirSec} с-тан ұзақ түсініксіз үзіліс жоқ.`), [], ctx, { checked: true });
    const ev = owed.map((s) => byIdx(s.afterIdx)).filter((m): m is MessageDto => Boolean(m));
    const pauses = owed.map((s) => `${s.durSec} с перед #${s.afterIdx}`).join(", ");
    const pausesEn = owed.map((s) => `${s.durSec} s before #${s.afterIdx}`).join(", ");
    const d = owed.length
      ? L(`Необъяснённые паузы без предупреждения клиента: ${pauses}.`, `Unexplained pauses without warning the client: ${pausesEn}.`, `Клиентті ескертпестен түсініксіз үзілістер: ${pauses}.`)
      : L(`Оператор отвечает медленно: медианная задержка ${lat} с (норма ≤ ${T.slowMedianLatencySec} с).`, `The operator responds slowly: median delay ${lat} s (≤ ${T.slowMedianLatencySec} s expected).`, `Оператор баяу жауап береді: медиандық кідіріс ${lat} с (қалыпты ≤ ${T.slowMedianLatencySec} с).`);
    const v = verdict(scaleValue(c, 0), d, ev, ctx, { checked: true });
    const s0 = owed[0];
    return s0 && s0.beforeIdx !== null && s0.afterIdx !== null ? { ...v, checkedRange: { from: s0.beforeIdx, to: s0.afterIdx } } : v;
  },

  voice_calm(c, ctx) {
    const a = ctx.audio;
    if (!a || !a.client || !a.operator) return noVoice(c, ctx);
    const T = VOICE_THRESHOLDS;
    const firstOp = ctx.ops[0];
    const opStartT = a.operator.perUtterance[0]?.t ?? 0;
    // Agitation = a sustained acoustic episode (≥ 2 agitated client phrases within 30 s) after the operator joined,
    // or explicit verbal dissatisfaction from the client.
    const agitated = a.client.perUtterance.filter((u) => u.t >= opStartT && u.arousal >= T.upsetArousal);
    const episodes = agitated.filter((u) => agitated.some((o) => o !== u && Math.abs(o.t - u.t) <= 30));
    const verbal = ctx.messages.filter((m) => m.speaker === "client" && m.idx > firstOp.idx && has(m.text, WORDS.complaint));
    const upset = [...episodes.map((u) => u.idx), ...verbal.map((m) => m.idx)].filter((v, i, arr) => arr.indexOf(v) === i).sort((x, y) => x - y);
    if (!upset.length) {
      const reason = L("Клиент говорил спокойно: эмоциональных всплесков (высота и громкость голоса выше обычных для клиента) и жалоб не выявлено.", "The client stayed calm: no emotional spikes (pitch and loudness above the client's norm) or complaints were found.", "Клиент сабырлы сөйледі: эмоционалды серпіліс (клиенттің әдеттегіден жоғары дауысы) және шағым анықталмады.");
      return verdict("na", reason, [], ctx, { na: reason });
    }
    const firstUpset = ctx.messages.find((m) => m.idx === upset[0])!;
    const upsetT = firstUpset.audioStart ?? 0;
    const raised = a.operatorRaised.filter((r) => r.t >= upsetT - 1 && r.t <= upsetT + 20);
    if (raised.length) {
      const r0 = raised[0];
      const m = ctx.messages.find((x) => x.idx === r0.idx);
      return verdict(scaleValue(c, 0), L(`Клиент был взволнован (реплика #${firstUpset.idx}), а оператор повысил голос в ответ: реплика #${r0.idx} громче его обычной речи на ${r0.dbOver} дБ и выше на ${r0.stOver} пт.`, `The client was upset (message #${firstUpset.idx}) and the operator raised their voice: message #${r0.idx} is ${r0.dbOver} dB louder and ${r0.stOver} st higher than usual.`, `Клиент толқыды (#${firstUpset.idx}), ал оператор дауысын көтерді: #${r0.idx} әдеттегіден ${r0.dbOver} дБ қатты және ${r0.stOver} пт жоғары.`), [firstUpset, ...(m ? [m] : [])], ctx);
    }
    const reply = ctx.ops.filter((m) => m.idx > firstUpset.idx).slice(0, 2);
    // A reaction to the emotion means empathy wording, not just politeness.
    const reacted = reply.find((m) => has(m.text, WORDS.empathy));
    if (reacted)
      return verdict(scaleValue(c, 1), L(`Клиент был взволнован (реплика #${firstUpset.idx}); оператор сохранил спокойный тон (без повышения голоса) и отреагировал: ${q(reacted)}`, `The client was upset (message #${firstUpset.idx}); the operator kept a calm voice and responded: ${q(reacted)}`, `Клиент толқыды (#${firstUpset.idx}); оператор сабырлы үнін сақтап, жауап берді: ${q(reacted)}`), [firstUpset, reacted], ctx);
    return verdict(scaleValue(c, 0), L(`Клиент был взволнован (реплика #${firstUpset.idx}); оператор голос не повышал, но на эмоцию клиента не отреагировал.`, `The client was upset (message #${firstUpset.idx}); the operator did not raise their voice but did not respond to the client's emotion.`, `Клиент толқыды (#${firstUpset.idx}); оператор дауысын көтермеді, бірақ клиенттің эмоциясына жауап бермеді.`), [firstUpset, ...reply], ctx, { checked: true });
  },

  keywords_absent(c, ctx) {
    const kws = keywordsFor(c, ctx.lang);
    const hit = kws.length ? ctx.ops.filter((m) => has(m.text, kws)) : [];
    if (hit.length)
      return verdict(scaleValue(c, 0), L(`Запрещённая формулировка: ${q(hit[0])}`, `Prohibited wording: ${q(hit[0])}`, `Тыйым салынған тұжырым: ${q(hit[0])}`), hit, ctx);
    return verdict(scaleValue(c, 1), L("Запрещённых формулировок не найдено. Проверены все сообщения оператора.", "No prohibited wording found. All operator messages were checked.", "Тыйым салынған тұжырымдар табылмады. Оператордың барлық хабарламалары тексерілді."), [], ctx, { checked: true });
  },
};

/** Voice criteria are not applicable without a recording (chats) or when the audio could not be analysed. */
function noVoice(c: CriterionDef, ctx: Ctx): Draft {
  const reason = ctx.audio
    ? L("Голос оператора в записи не удалось проанализировать.", "The operator's voice could not be analysed in the recording.", "Жазбадағы оператор дауысын талдау мүмкін болмады.")
    : L("Нет аудиозаписи (чат) — голосовой критерий не применяется.", "No recording (chat) — voice criteria do not apply.", "Аудиожазба жоқ (чат) — дауыс критерийі қолданылмайды.");
  if (c.naAllowed) return verdict("na", reason, [], ctx, { na: reason });
  return verdict(scaleValue(c, 0), reason, [], ctx, { checked: true });
}

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
  async evaluate({ conversation, messages, checklist, audio }: { conversation: { language: Lang }; messages: MessageDto[]; checklist: ChecklistDef; audio?: AudioBundle | null }) {
    const ops = messages.filter((m) => m.speaker === "operator");
    const ctx: Ctx = {
      lang: conversation.language,
      messages,
      ops,
      range: ops.length ? { from: ops[0].idx, to: messages[messages.length - 1].idx } : null,
      audio: audio?.metrics ?? null,
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
