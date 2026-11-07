import type { Lang } from "../types";
import { pickLocalized } from "../localized";

export interface CriterionI18n {
  title: Record<Lang, string>;
  description?: Record<Lang, string>;
}

export const CRITERIA_I18N: Record<string, CriterionI18n> = {
  C1: {
    title: {
      RU: "Приветствие и представление",
      EN: "Greeting and introduction",
      KZ: "Сәлемдесу және таныстыру",
    },
    description: {
      RU: "Оператор приветствует клиента и называет своё имя в первом сообщении.",
      EN: "The operator greets the customer and states their name in the first message.",
      KZ: "Оператор бірінші хабарламада клиентпен сәлемдесіп, өз атын атайды.",
    },
  },
  C2: {
    title: {
      RU: "Выявление потребности",
      EN: "Need discovery & clarification",
      KZ: "Қажеттілікті анықтау",
    },
    description: {
      RU: "Оператор уточняет запрос клиента вопросами.",
      EN: "The operator clarifies the customer's request using questions.",
      KZ: "Оператор сұрақтар арқылы клиенттің сұрауын нақтылайды.",
    },
  },
  C3: {
    title: {
      RU: "Корректность и полнота консультации",
      EN: "Consultation accuracy & completeness",
      KZ: "Кеңестің дұрыстығы мен толықтығы",
    },
    description: {
      RU: "Ответ по существу, с конкретными шагами решения вопроса.",
      EN: "Substantive response with clear next steps and actionable advice.",
      KZ: "Мәселені шешудің нақты қадамдары бар мазмұнды жауап.",
    },
  },
  C4: {
    title: {
      RU: "Безопасность данных",
      EN: "Data security",
      KZ: "Деректер қауіпсіздігі",
    },
    description: {
      RU: "Оператор не запрашивает пароли, PIN, CVV или полные номера карт.",
      EN: "The operator never asks for passwords, PIN, CVV, or full card numbers.",
      KZ: "Оператор құпия сөздерді, PIN, CVV немесе толық карта нөмірлерін сұрамайды.",
    },
  },
  C5: {
    title: {
      RU: "Вежливость и тон",
      EN: "Politeness and tone",
      KZ: "Сыпайылық және тон",
    },
    description: {
      RU: "Вежливые формулировки, эмпатия, отсутствие грубости и раздражения.",
      EN: "Courteous wording, empathy, absence of rudeness or irritation.",
      KZ: "Сыпайы сөз тіркестері, эмпатия, дөрекілік пен ашудың болмауы.",
    },
  },
  C6: {
    title: {
      RU: "Предупреждение об ожидании",
      EN: "Wait warning & hold time",
      KZ: "Күту туралы ескерту",
    },
    description: {
      RU: "Предупреждение клиента о паузе или поиске данных более 60 секунд.",
      EN: "Warning the customer before putting them on hold or searching for over 60 seconds.",
      KZ: "60 секундтан астам үзіліс немесе деректерді іздеу кезінде клиентке ескерту.",
    },
  },
  C7: {
    title: {
      RU: "Передача вопроса по регламенту",
      EN: "Escalation & timeline",
      KZ: "Регламент бойынша беру",
    },
    description: {
      RU: "Фиксация обращения и указание точного срока предоставления ответа.",
      EN: "Registering the escalation and specifying a clear resolution deadline.",
      KZ: "Өтінішті тіркеу және нақты жауап беру мерзімін көрсету.",
    },
  },
  C8: {
    title: {
      RU: "Завершение диалога",
      EN: "Dialogue closing",
      KZ: "Диалогты аяқтау",
    },
    description: {
      RU: "Вопрос об оставшихся вопросах и вежливое прощание.",
      EN: "Checking for remaining questions and courteous sign-off.",
      KZ: "Басқа сұрақтардың бар-жоғын нақтылау және сыпайы қоштасу.",
    },
  },
  V1: {
    title: {
      RU: "Ровный, спокойный голос",
      EN: "Steady, calm voice",
      KZ: "Бірқалыпты, сабырлы дауыс",
    },
  },
  V2: {
    title: {
      RU: "Голос: не перебивать",
      EN: "Voice: no interruptions",
      KZ: "Дауыс: сөзді бөлмеу",
    },
  },
  V3: {
    title: {
      RU: "Голос: темп и паузы",
      EN: "Voice: pace and pauses",
      KZ: "Дауыс: қарқын мен кідірістер",
    },
  },
  V4: {
    title: {
      RU: "Голос: спокойствие",
      EN: "Voice: composure & tone",
      KZ: "Дауыс: сабырлылық",
    },
  },
};

export const SECTIONS_I18N: Record<string, Record<Lang, string>> = {
  open: {
    RU: "Начало",
    EN: "Opening",
    KZ: "Бастау",
  },
  consult: {
    RU: "Консультация",
    EN: "Consultation",
    KZ: "Кеңес беру",
  },
  handling: {
    RU: "Ведение диалога",
    EN: "Dialogue handling",
    KZ: "Диалогты жүргізу",
  },
  close: {
    RU: "Завершение",
    EN: "Closing",
    KZ: "Аяқтау",
  },
  voice: {
    RU: "Голосовые параметры",
    EN: "Voice & Speech",
    KZ: "Дауыс параметрлері",
  },
};

const TITLE_TO_CODE: Record<string, string> = {
  "приветствие и представление": "C1",
  "приветствие и имя": "C1",
  "greeting and introduction": "C1",
  "greeting and name": "C1",
  "выявление потребности": "C2",
  "уточняющие вопросы": "C2",
  "need discovery & clarification": "C2",
  "clarifying questions": "C2",
  "корректность и полнота консультации": "C3",
  "полнота консультации": "C3",
  "consultation accuracy & completeness": "C3",
  "consultation completeness": "C3",
  "безопасность данных": "C4",
  "data security": "C4",
  "вежливость и тон": "C5",
  "вежливость": "C5",
  "politeness and tone": "C5",
  "politeness": "C5",
  "предупреждение об ожидании": "C6",
  "wait warning & hold time": "C6",
  "wait warning": "C6",
  "передача вопроса по регламенту": "C7",
  "передача со сроком": "C7",
  "escalation & timeline": "C7",
  "hand-off with timeline": "C7",
  "завершение диалога": "C8",
  "завершение": "C8",
  "dialogue closing": "C8",
  "closing": "C8",
};

const NAME_TO_SECTION_KEY: Record<string, string> = {
  "начало": "open",
  "opening": "open",
  "консультация": "consult",
  "consultation": "consult",
  "ведение диалога": "handling",
  "dialogue handling": "handling",
  "завершение": "close",
  "closing": "close",
  "голос": "voice",
  "голосовые параметры": "voice",
  "voice": "voice",
};

/** Returns the criterion title translated into the current UI language. */
export function getCriterionTitle(code?: string | null, rawTitle?: string | null, lang: Lang = "RU"): string {
  // If rawTitle is a JSON localized object: { "RU": "...", "EN": "..." }
  if (rawTitle && rawTitle.startsWith("{")) {
    const picked = pickLocalized(rawTitle, lang);
    if (picked) return picked;
  }

  // 1. Check by explicit criterion code
  if (code && CRITERIA_I18N[code]) {
    return CRITERIA_I18N[code].title[lang] || CRITERIA_I18N[code].title.RU;
  }

  // 2. Check by rawTitle string matching standard criteria
  if (rawTitle) {
    const normalized = rawTitle.trim().toLowerCase();
    const inferredCode = TITLE_TO_CODE[normalized];
    if (inferredCode && CRITERIA_I18N[inferredCode]) {
      return CRITERIA_I18N[inferredCode].title[lang] || CRITERIA_I18N[inferredCode].title.RU;
    }
  }

  return rawTitle || code || "";
}

/** Returns the section name translated into the current UI language. */
export function getSectionName(key?: string | null, rawName?: string | null, lang: Lang = "RU"): string {
  if (key && SECTIONS_I18N[key]) {
    return SECTIONS_I18N[key][lang] || SECTIONS_I18N[key].RU;
  }
  if (rawName) {
    const normalized = rawName.trim().toLowerCase();
    const inferredKey = NAME_TO_SECTION_KEY[normalized];
    if (inferredKey && SECTIONS_I18N[inferredKey]) {
      return SECTIONS_I18N[inferredKey][lang] || SECTIONS_I18N[inferredKey].RU;
    }
  }
  return rawName || key || "";
}

/** Returns the checklist name translated into the current UI language. */
export function locChecklistName(name?: string | null, lang: Lang = "RU"): string {
  if (!name) return "";
  if (name.includes("Базовый чек-лист CQA") || name.toLowerCase().includes("базовый чек-лист")) {
    if (lang === "EN") return name.replace(/Базовый чек-лист CQA/gi, "Default CQA Checklist").replace(/Базовый чек-лист/gi, "Default Checklist");
    if (lang === "KZ") return name.replace(/Базовый чек-лист CQA/gi, "Негізгі CQA чек-парағы").replace(/Базовый чек-лист/gi, "Негізгі чек-парақ");
  }
  return name;
}
