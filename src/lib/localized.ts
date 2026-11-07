// Evaluator explanations can be stored as a JSON object {RU, EN, KZ} so the UI language toggle
// can show them in any language. Plain strings from earlier evaluators are translated when possible.
import type { Lang } from "./types";

export type Localized = Record<Lang, string>;

export function encodeLocalized(l: Localized): string {
  return JSON.stringify(l);
}

const EXACT_TRANSLATIONS: Record<string, Record<Lang, string>> = {
  "оператор не задавал уточняющих вопросов, сразу дал ответ.": {
    RU: "Оператор не задавал уточняющих вопросов, сразу дал ответ.",
    EN: "The operator did not ask clarifying questions and gave an answer immediately.",
    KZ: "Оператор нақтылау сұрақтарын қоймай, бірден жауап берді.",
  },
  "оператор не задавал уточняющих вопросов, сразу дал ответ": {
    RU: "Оператор не задавал уточняющих вопросов, сразу дал ответ",
    EN: "The operator did not ask clarifying questions and gave an answer immediately",
    KZ: "Оператор нақтылау сұрақтарын қоймай, бірден жауап берді",
  },
  "оператор не задавал уточняющих вопросов.": {
    RU: "Оператор не задавал уточняющих вопросов.",
    EN: "The operator did not ask clarifying questions.",
    KZ: "Оператор нақтылау сұрақтарын қоймады.",
  },
  "оператор не задавал уточняющих вопросов": {
    RU: "Оператор не задавал уточняющих вопросов",
    EN: "The operator did not ask clarifying questions",
    KZ: "Оператор нақтылау сұрақтарын қоймады",
  },
  "критерий не применим": {
    RU: "Критерий не применим",
    EN: "Criterion is not applicable",
    KZ: "Критерий қолданылмайды",
  },
  "критерий не применим.": {
    RU: "Критерий не применим.",
    EN: "Criterion is not applicable.",
    KZ: "Критерий қолданылмайды.",
  },
  "критерий отмечен n/a по умолчанию.": {
    RU: "Критерий отмечен N/A по умолчанию.",
    EN: "Criterion marked N/A by default.",
    KZ: "Критерий әдепкі бойынша N/A ретінде белгіленген.",
  },
  "не применимо по умолчанию": {
    RU: "Не применимо по умолчанию",
    EN: "Not applicable by default",
    KZ: "Әдепкі бойынша қолданылмайды",
  },
};

const COMMON_PATTERNS: Array<{
  match: RegExp;
  EN: string | ((m: RegExpMatchArray) => string);
  KZ: string | ((m: RegExpMatchArray) => string);
}> = [
  {
    match: /Оператор не задавал уточняющих вопросов[.,]?\s*сразу дал ответ\.?/i,
    EN: "The operator did not ask clarifying questions and gave an answer immediately.",
    KZ: "Оператор нақтылау сұрақтарын қоймай, бірден жауап берді.",
  },
  {
    match: /Оператор не задавал уточняющих вопросов/i,
    EN: "The operator did not ask clarifying questions",
    KZ: "Оператор нақтылау сұрақтарын қоймады",
  },
  {
    match: /В первом сообщении оператор поздоровался и назвал своё имя:?\s*(".*?")/i,
    EN: (m) => `In the first message, the operator greeted and stated their name: ${m[1]}`,
    KZ: (m) => `Бірінші хабарламада оператор сәлемдесіп, өз атын атады: ${m[1]}`,
  },
  {
    match: /Оператор не запрашивал пароль, PIN, CVV, номер карты и не предлагал переводить деньги\.?/i,
    EN: "The operator did not request passwords, PIN, CVV, card numbers, or suggest transferring money.",
    KZ: "Оператор құпия сөз, PIN, CVV, карта нөмірін сұрамады және ақша аударуды ұсынбады.",
  },
  {
    match: /Тон общения вежливый и дружелюбный:?\s*(".*?")/i,
    EN: (m) => `Tone of communication was polite and friendly: ${m[1]}`,
    KZ: (m) => `Қарым-қатынас тоны сыпайы әрі мейірімді болды: ${m[1]}`,
  },
  {
    match: /В диалоге не было пауз оператора более 60 секунд, поэтому критерий не применим\.?/i,
    EN: "There were no operator pauses over 60 seconds in the dialogue, so the criterion is not applicable.",
    KZ: "Диалогта оператор тарапынан 60 секундтан асатын үзілістер болған жоқ, сондықтан критерий қолданылмайды.",
  },
  {
    match: /Передача вопроса уже выполнена системой, оператор не называл сроков ответа, критерий не требовался\.?/i,
    EN: "Escalation was handled automatically, no transfer timeline was needed from the operator.",
    KZ: "Мәселені беру жүйемен орындалды, оператордан мерзім атау талап етілмеді.",
  },
  {
    match: /Передача вопроса специалистам не требовалась/i,
    EN: "Escalation to specialists was not required",
    KZ: "Мамандарға мәселені беру талап етілмеді",
  },
  {
    match: /Оператор попрощался с клиентом:?\s*(".*?")\s*–?\s*корректное завершение диалога\.?/i,
    EN: (m) => `The operator said goodbye to the client: ${m[1]} – proper dialogue closing.`,
    KZ: (m) => `Оператор клиентпен қоштасты: ${m[1]} – диалогты дұрыс аяқтау.`,
  },
  {
    match: /Оператор поприветствовал клиента и представился/i,
    EN: "The operator greeted the customer and introduced themselves",
    KZ: "Оператор клиентпен сәлемдесіп, өзін таныстырды",
  },
  {
    match: /Оператор корректно завершил диалог, попрощавшись с клиентом/i,
    EN: "The operator correctly concluded the dialogue by saying goodbye to the customer",
    KZ: "Оператор клиентпен қоштасып, диалогты дұрыс аяқтады",
  },
  {
    match: /Нарушений безопасности данных не обнаружено/i,
    EN: "No data security violations were detected",
    KZ: "Деректер қауіпсіздігін бұзушылықтар анықталмады",
  },
  {
    match: /Общий тон диалога был вежливым и эмпатичным/i,
    EN: "The overall dialogue tone was polite and empathetic",
    KZ: "Диалогтың жалпы тоны сыпайы және эмпатиялы болды",
  },
  {
    match: /поэтому критерий не применим/i,
    EN: "therefore the criterion is not applicable",
    KZ: "сондықтан критерий қолданылмайды",
  },
];

export function pickLocalized(value: string | null | undefined, lang: Lang): string {
  if (!value) return "";
  if (value.startsWith("{")) {
    try {
      const o = JSON.parse(value) as Partial<Localized>;
      return o[lang] ?? o.RU ?? o.EN ?? Object.values(o)[0] ?? value;
    } catch {
      return value;
    }
  }

  // If UI is Russian, return value as is
  if (lang === "RU") return value;

  const normalized = value.trim().toLowerCase();
  const exact = EXACT_TRANSLATIONS[normalized];
  if (exact && exact[lang]) {
    return exact[lang];
  }

  for (const p of COMMON_PATTERNS) {
    if (p.match.test(value)) {
      const target = p[lang];
      if (typeof target === "function") {
        const m = value.match(p.match);
        if (m) return target(m);
      } else if (typeof target === "string") {
        return value.replace(p.match, target);
      }
    }
  }

  return value;
}
