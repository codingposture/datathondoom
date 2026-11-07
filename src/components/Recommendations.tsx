"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useToast } from "./Toast";
import { Spinner } from "./ui";
import { api } from "@/lib/client";
import type { ConversationDto, EvaluationDto, MessageDto, Lang } from "@/lib/types";

interface ActionableTip {
  criterionCode: string;
  title: string;
  issue: string;
  advice: string;
  exampleScript?: string;
}

interface AiRecommendationsResponse {
  generalFeedback?: string;
  strengths?: string[];
  actionableTips?: ActionableTip[];
  idealScriptExample?: string;
}

interface CoachingItem {
  advice: string;
  script: string;
  tag: string;
}

// Pre-defined expert coaching templates localized for RU, EN, and KZ
const CRITERIA_COACHING: Record<string, Record<Lang, CoachingItem>> = {
  C1: {
    RU: {
      advice: "Всегда называйте имя и компанию в первом сообщении оператора. Это формирует доверие и персональный контакт с первых секунд.",
      script: "«Здравствуйте! Меня зовут [Имя], служба поддержки Freedom Broker. Чем я могу вам помочь?»",
      tag: "Приветствие",
    },
    EN: {
      advice: "Always state your name and Freedom Broker in the first message. This builds customer trust and establishes a personal connection.",
      script: "“Hello! My name is [Name], Freedom Broker support. How can I help you today?”",
      tag: "Greeting",
    },
    KZ: {
      advice: "Оператордың алғашқы хабарламасында әрқашан атыңызды және компанияны атаңыз. Бұл сенім мен байланыс орнатады.",
      script: "«Сәлеметсіз бе! Менің атым [Есім], Freedom Broker қолдау қызметі. Сізге қалай көмектесе аламын?»",
      tag: "Сәлемдесу",
    },
  },
  C2: {
    RU: {
      advice: "Задавайте открытые или уточняющие вопросы до того, как переходить к решению. Это исключает неверные предположения и экономит время клиента.",
      script: "«Подскажите, пожалуйста, какая именно ошибка появляется на экране?»",
      tag: "Потребность",
    },
    EN: {
      advice: "Ask clarifying questions before offering a solution. This prevents false assumptions and saves the customer's time.",
      script: "“Could you please clarify what specific issue or error message appears on your screen?”",
      tag: "Need Discovery",
    },
    KZ: {
      advice: "Шешімге көшпес бұрын нақтылау сұрақтарын қойыңыз. Бұл қате болжамдардың алдын алып, клиенттің уақытын үнемдейді.",
      script: "«Экранда нақты қандай қате шығып тұрғанын айтып жібересіз бе?»",
      tag: "Қажеттілік",
    },
  },
  C3: {
    RU: {
      advice: "Предоставляйте пошаговый алгоритм действий с четкими названиями разделов и кнопок. Убедитесь, что клиент понял каждый шаг.",
      script: "«Для этого откройте приложение, перейдите в раздел 'Меню' -> 'Настройки' и нажмите 'Подтвердить'. Получилось?»",
      tag: "Консультация",
    },
    EN: {
      advice: "Provide a clear step-by-step walkthrough with precise menu names and buttons. Make sure the customer understands each step.",
      script: "“To do this, open the app, go to Menu -> Settings, and tap 'Confirm'. Did that work for you?”",
      tag: "Consultation",
    },
    KZ: {
      advice: "Бөлімдер мен батырмалардың нақты атаулары бар қадамдық нұсқаулық беріңіз. Клиенттің әрбір қадамды түсінгеніне көз жеткізіңіз.",
      script: "«Ол үшін қосымшаны ашып, 'Мәзір' -> 'Баптаулар' бөліміне өтіп, 'Растау' батырмасын басыңыз. Орындалды ма?»",
      tag: "Кеңес беру",
    },
  },
  C4: {
    RU: {
      advice: "КРИТИЧЕСКИ ВАЖНО: Категорически запрещено запрашивать пароли, PIN, CVV/CVC, полный номер карты или предлагать перевести средства на личные счета.",
      script: "«В целях вашей безопасности сотрудники поддержки никогда не запрашивают пароли или PIN-коды.»",
      tag: "Безопасность",
    },
    EN: {
      advice: "CRITICAL: Strictly forbidden to ask for passwords, PIN, CVV/CVC, card numbers, or suggest transferring funds to personal accounts.",
      script: "“For your security, Freedom Broker employees never ask for passwords, PIN codes, or card details.”",
      tag: "Security",
    },
    KZ: {
      advice: "ӨТЕ МАҢЫЗДЫ: Құпия сөздерді, PIN, CVV/CVC, картаның толық нөмірін сұрауға немесе жеке шотқа ақша аударуды ұсынуға қатаң тыйым салынады.",
      script: "«Қауіпсіздігіңіз үшін қолдау қызметінің мамандары ешқашан құпия сөздер мен PIN-кодтарды сұрамайды.»",
      tag: "Қауіпсіздік",
    },
  },
  C5: {
    RU: {
      advice: "Используйте слова вежливости ('пожалуйста', 'благодарю') и проявляйте эмпатию, если клиент расстроен или столкнулся со сложностями.",
      script: "«Понимаю ваше беспокойство, давайте вместе разберемся в этой ситуации.»",
      tag: "Тон и эмпатия",
    },
    EN: {
      advice: "Use polite phrasing ('please', 'thank you') and show empathy if the customer is frustrated or experiencing difficulties.",
      script: "“I understand how frustrating that can be, let's look into this together.”",
      tag: "Politeness & Tone",
    },
    KZ: {
      advice: "Сыпайы сөздерді ('өтінемін', 'рахмет') қолданыңыз және клиент ренжігенде немесе қиындыққа тап болғанда эмпатия танытыңыз.",
      script: "«Сіздің алаңдаушылығыңызды түсінемін, осы жағдайды бірге шешейік.»",
      tag: "Сыпайылық",
    },
  },
  C6: {
    RU: {
      advice: "Если поиск информации или проверка данных займет более 60 секунд, обязательно предупредите клиента и поблагодарите за ожидание.",
      script: "«Мне потребуется 1-2 минуты для уточнения информации. Пожалуйста, оставайтесь на линии.»",
      tag: "Ожидание",
    },
    EN: {
      advice: "If looking up information takes longer than 60 seconds, warn the customer in advance and thank them for their patience.",
      script: "“I need 1–2 minutes to check the information. Please stay on the line.”",
      tag: "Hold Time",
    },
    KZ: {
      advice: "Ақпаратты іздеу 60 секундтан астам уақытты алса, клиентке міндетті түрде ескертіп, күткені үшін алғыс айтыңыз.",
      script: "«Ақпаратты нақтылау үшін 1-2 минут қажет болады. Желіде күте тұрыңызшы.»",
      tag: "Күту",
    },
  },
  C7: {
    RU: {
      advice: "При передаче вопроса в профильный отдел или бэк-офис всегда фиксируйте точный срок решения или обратной связи.",
      script: "«Я зафиксировал обращение и передал его специалистам. Ответ поступит вам в течение 24 часов в приложении.»",
      tag: "Эскалация",
    },
    EN: {
      advice: "When escalating to back-office or specialists, always provide a clear deadline or expected callback time.",
      script: "“I have forwarded your request to specialists. You will receive an update in the app within 24 hours.”",
      tag: "Escalation",
    },
    KZ: {
      advice: "Сұрақты бейінді бөлімге немесе бэк-офиске өткізгенде әрқашан нақты шешу немесе кері байланыс мерзімін көрсетіңіз.",
      script: "«Өтінішті тіркеп, мамандарға жолдадым. Жауап қосымшада 24 сағат ішінде келеді.»",
      tag: "Беру",
    },
  },
  C8: {
    RU: {
      advice: "Перед завершением диалога уточните, остались ли другие вопросы, и вежливо попрощайтесь.",
      script: "«Подскажите, остались ли у вас еще вопросы? Был рад помочь, хорошего вам дня!»",
      tag: "Завершение",
    },
    EN: {
      advice: "Before ending the dialogue, ask if there are any remaining questions and give a warm goodbye.",
      script: "“Do you have any other questions today? Glad to have helped, have a wonderful day!”",
      tag: "Closing",
    },
    KZ: {
      advice: "Диалогты аяқтамас бұрын басқа сұрақтардың бар-жоғын нақтылап, сыпайы қоштасыңыз.",
      script: "«Басқа сұрақтарыңыз қалды ма? Көмектескеніме қуаныштымын, күніңіз сәтті өтсін!»",
      tag: "Аяқтау",
    },
  },
  V1: {
    RU: {
      advice: "Говорите ровно и спокойно: избегайте резких перепадов высоты голоса и эмоциональных всплесков, даже если клиент взволнован.",
      script: "«Сохраняйте ровный, уверенный и доброжелательный тон на протяжении всего разговора.»",
      tag: "Ровный тон",
    },
    EN: {
      advice: "Speak evenly and calmly: avoid sharp pitch swings and emotional spikes, even when the client is upset.",
      script: "“Keep a steady, confident and friendly tone throughout the conversation.”",
      tag: "Steady tone",
    },
    KZ: {
      advice: "Бірқалыпты әрі сабырлы сөйлеңіз: клиент толқып тұрса да, дауыс биіктігінің күрт өзгеруінен және эмоционалды серпілістерден аулақ болыңыз.",
      script: "«Әңгіме бойы бірқалыпты, сенімді және мейірімді үнді сақтаңыз.»",
      tag: "Бірқалыпты үн",
    },
  },
  V2: {
    RU: {
      advice: "Не перебивайте клиента, дайте ему договорить мысль до конца. Делайте паузу в 1-1.5 секунды перед началом своего ответа.",
      script: "«Если случайно перебили: 'Прошу прощения, продолжайте, пожалуйста.'»",
      tag: "Перебивания",
    },
    EN: {
      advice: "Do not interrupt the customer. Let them finish their thought, and pause for 1–1.5 seconds before replying.",
      script: "“If interrupted: 'Pardon me, please continue.'“",
      tag: "Interruptions",
    },
    KZ: {
      advice: "Клиенттің сөзін бөлмеңіз, ойын аяқтауға мүмкіндік беріңіз. Жауап берер алдында 1-1.5 секунд кідіріңіз.",
      script: "«Сөзін бөліп қойсаңыз: 'Кешіріңіз, жалғастыра беріңізші.'»",
      tag: "Сөзді бөлмеу",
    },
  },
  V3: {
    RU: {
      advice: "Избегайте мертвого эфира (dead air) дольше 5 секунд. Если нужно посмотреть данные, озвучивайте свои действия клиенту.",
      script: "«Секунду, сверяю данные в системе...»",
      tag: "Паузы",
    },
    EN: {
      advice: "Avoid dead air longer than 5 seconds. When searching databases, narrate your actions.",
      script: "“One moment, checking your account details in the system...”",
      tag: "Pauses",
    },
    KZ: {
      advice: "5 секундтан артық үнсіздіктен аулақ болыңыз. Деректерді іздеген кезде әрекетіңізді дауыстап айтыңыз.",
      script: "«Бір сәт, жүйедегі деректерді тексеріп жатырмын...»",
      tag: "Кідірістер",
    },
  },
  V4: {
    RU: {
      advice: "Если клиент говорит на повышенных тонах или волнуется, сохраняйте спокойный, ровный темп речи и мягкую интонацию.",
      script: "«Я вас услышал, не переживайте, мы решим этот вопрос прямо сейчас.»",
      tag: "Спокойствие",
    },
    EN: {
      advice: "If the customer speaks loudly or becomes upset, keep a calm, steady pace and soft tone.",
      script: "“I hear you, don't worry, we will resolve this for you right now.”",
      tag: "Composure",
    },
    KZ: {
      advice: "Егер клиент көтеріңкі үнмен сөйлесе, сабырлы, байсалды қарқынды сақтаңыз.",
      script: "«Сізді түсіндім, алаңдамаңыз, біз бұл мәселені қазір шешеміз.»",
      tag: "Сабырлылық",
    },
  },
};

const CHEAT_SHEET_PHRASES: Record<Lang, Array<{ label: string; preview: string; full: string }>> = {
  RU: [
    {
      label: "Приветствие:",
      preview: "«Здравствуйте! Меня зовут [Имя], Freedom Broker. Чем могу помочь?»",
      full: "Здравствуйте! Меня зовут [Имя], Freedom Broker. Чем я могу вам помочь?",
    },
    {
      label: "Ожидание / Пауза:",
      preview: "«Мне потребуется 1-2 минуты для проверки. Пожалуйста, ожидайте.»",
      full: "Мне потребуется 1-2 минуты для проверки информации. Пожалуйста, оставайтесь на связи.",
    },
    {
      label: "Передача со сроком:",
      preview: "«Передал вопрос специалистам, ответ поступит в течение 24 часов.»",
      full: "Я зафиксировал ваш запрос и передал профильным специалистам. Ответ поступит в течение 24 часов.",
    },
    {
      label: "Завершение диалога:",
      preview: "«Остались ли вопросы? Был рад помочь, хорошего дня!»",
      full: "Остались ли у вас еще вопросы? Был рад помочь вам, хорошего дня!",
    },
  ],
  EN: [
    {
      label: "Greeting:",
      preview: "“Hello! My name is [Name], Freedom Broker. How can I assist you?”",
      full: "Hello! My name is [Name], Freedom Broker support. How can I assist you today?",
    },
    {
      label: "Hold / Pause:",
      preview: "“I need 1–2 minutes to check the details. Please stay on the line.”",
      full: "I need 1–2 minutes to verify the information. Please stay on the line.",
    },
    {
      label: "Escalation & Timeline:",
      preview: "“Forwarded to specialists, you will receive an update within 24h.”",
      full: "I have registered your ticket and escalated it to specialists. You will receive an answer within 24 hours.",
    },
    {
      label: "Closing dialogue:",
      preview: "“Any other questions? Glad to have helped, have a wonderful day!”",
      full: "Do you have any other questions today? Glad to have helped you, have a wonderful day!",
    },
  ],
  KZ: [
    {
      label: "Сәлемдесу:",
      preview: "«Сәлеметсіз бе! Менің атым [Есім], Freedom Broker. Қалай көмектесемін?»",
      full: "Сәлеметсіз бе! Менің атым [Есім], Freedom Broker. Сізге қалай көмектесе аламын?",
    },
    {
      label: "Күту / Үзіліс:",
      preview: "«Ақпаратты тексеру үшін 1-2 минут қажет. Желіде күте тұрыңыз.»",
      full: "Ақпаратты тексеру үшін 1-2 минут қажет болады. Желіде күте тұрыңызшы.",
    },
    {
      label: "Мерзімі бар беру:",
      preview: "«Мамандарға жолдадым, жауап 24 сағат ішінде келеді.»",
      full: "Сұрауыңызды тіркеп, тиісті мамандарға жолдадым. Жауап 24 сағат ішінде келеді.",
    },
    {
      label: "Диалогты аяқтау:",
      preview: "«Басқа сұрақтар қалды ма? Көмектескеніме қуаныштымын, сәтті күн!»",
      full: "Басқа сұрақтарыңыз қалды ма? Көмектескеніме қуаныштымын, күніңіз сәтті өтсін!",
    },
  ],
};

export function Recommendations({
  evaluation,
  conversation,
  messages: _messages,
  onJump,
  onSelectCriterion,
}: {
  evaluation: EvaluationDto;
  conversation: ConversationDto;
  messages: MessageDto[];
  onJump?: (idx: number) => void;
  onSelectCriterion?: (resultId: string) => void;
}) {
  const { t, loc, lang, critTitle } = useI18n();
  const toast = useToast();
  const [aiData, setAiData] = useState<AiRecommendationsResponse | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [copiedScript, setCopiedScript] = useState<string | null>(null);

  // Identify lowered criteria (where points < maxPoints)
  const lowered = evaluation.results.filter(
    (r) => r.finalAnswer !== "na" && r.finalPoints < r.finalMaxPoints
  );

  // Identify fully passed criteria
  const passed = evaluation.results.filter(
    (r) => r.finalAnswer !== "na" && r.finalPoints >= r.finalMaxPoints && r.finalMaxPoints > 0
  );

  const copyScript = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScript(text);
    toast(t("rec.copied"), "info");
    setTimeout(() => setCopiedScript(null), 2500);
  };

  const fetchAiCoaching = async () => {
    setLoadingAi(true);
    try {
      const data = await api<AiRecommendationsResponse>(
        `/api/conversations/${encodeURIComponent(conversation.id)}/recommendations?lang=${lang}`
      );
      setAiData(data);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoadingAi(false);
    }
  };

  const phrases = CHEAT_SHEET_PHRASES[lang] || CHEAT_SHEET_PHRASES.RU;

  return (
    <div className="card">
      <div className="card__head" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 14 }}>
        <div>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 18 }}>💡</span>
            <h2>{t("rec.title")}</h2>
            {evaluation.finalTotal >= 90 ? (
              <span className="badge badge--green">{t("rec.statusExcellent")}</span>
            ) : evaluation.finalTotal >= 70 ? (
              <span className="badge badge--olive">{t("rec.statusGood")}</span>
            ) : (
              <span className="badge badge--danger">{t("rec.statusNeedsWork")}</span>
            )}
          </div>
          <div className="small faint" style={{ marginTop: 4 }}>
            {t("rec.subtitle")}
          </div>
        </div>

        <button
          className="btn btn--sm btn--primary"
          onClick={fetchAiCoaching}
          disabled={loadingAi}
          title="Сгенерировать глубокий разбор от AI"
        >
          {loadingAi ? <Spinner /> : <span>⚡</span>}
          {loadingAi ? t("rec.aiCoachLoading") : t("rec.aiCoachBtn")}
        </button>
      </div>

      <div className="card__body stack" style={{ gap: 16 }}>
        {/* AI Deep Coaching Box (if generated) */}
        {aiData ? (
          <div
            style={{
              background: "var(--accent-tint)",
              border: "1px solid var(--accent-line)",
              borderRadius: "var(--radius-sm)",
              padding: "14px 16px",
            }}
          >
            <div className="row" style={{ gap: 6, marginBottom: 8, alignItems: "center" }}>
              <span className="badge badge--green">{t("rec.aiSupervisorReview")}</span>
            </div>
            {aiData.generalFeedback ? (
              <p style={{ margin: "0 0 12px 0", fontSize: 13.5, lineHeight: 1.5, color: "var(--text)" }}>
                {aiData.generalFeedback}
              </p>
            ) : null}

            {aiData.idealScriptExample ? (
              <div style={{ marginTop: 10, background: "var(--surface)", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)" }}>
                <div className="small faint" style={{ fontWeight: 600, marginBottom: 4 }}>
                  {t("rec.idealScript")}
                </div>
                <div style={{ fontStyle: "italic", fontSize: 13, color: "var(--brand)" }}>
                  {aiData.idealScriptExample}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Actionable Improvement Areas */}
        {lowered.length > 0 ? (
          <div>
            <div className="small faint" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
              ⚠️ {t("rec.improvements")} ({lowered.length})
            </div>
            <div className="stack" style={{ gap: 10 }}>
              {lowered.map((r) => {
                const c = evaluation.checklist.criteria.find((x) => x.id === r.criterionId);
                const title = critTitle(r.code, c?.title);
                const coachingByLang = CRITERIA_COACHING[r.code];
                const coach = (coachingByLang ? (coachingByLang[lang] || coachingByLang.RU) : null) || {
                  advice: loc(r.explanation),
                  script: "",
                  tag: title,
                };
                const isCritical = Boolean(c?.isCritical);

                return (
                  <div
                    key={r.id}
                    style={{
                      border: `1px solid ${isCritical ? "#efc1b5" : "var(--border)"}`,
                      borderLeft: `4px solid ${isCritical ? "var(--danger)" : "var(--warn)"}`,
                      borderRadius: 8,
                      padding: "12px 14px",
                      background: isCritical ? "var(--danger-soft)" : "var(--surface-2)",
                    }}
                  >
                    <div className="row row--between" style={{ marginBottom: 6 }}>
                      <div className="row" style={{ gap: 8, alignItems: "center" }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (onSelectCriterion) {
                              onSelectCriterion(r.id);
                            } else if (r.evidenceIdx.length > 0 && onJump) {
                              onJump(r.evidenceIdx[0]);
                            }
                          }}
                          className={`badge ${isCritical ? "badge--danger" : "badge--warn"}`}
                          style={{ cursor: "pointer", border: "none" }}
                          title={t("rec.clickToInspect")}
                        >
                          {r.code}: {title} ↗
                        </button>
                        {isCritical ? (
                          <span className="small" style={{ color: "var(--danger)", fontWeight: 700 }}>
                            {t("rec.criticalWarning")}
                          </span>
                        ) : null}
                      </div>
                      <span className="small faint">
                        {r.finalPoints} / {r.finalMaxPoints} {t("rec.pts")}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 8, lineHeight: 1.45 }}>
                      <b>{t("rec.issue")}:</b> {loc(r.explanation)}
                    </div>

                    <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 8, lineHeight: 1.45 }}>
                      <b>💡 {t("rec.coachAdvice")}:</b> {coach.advice}
                    </div>

                    {coach.script ? (
                      <div
                        style={{
                          background: "var(--surface)",
                          padding: "8px 12px",
                          borderRadius: 6,
                          border: "1px dashed var(--border-strong)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <span style={{ fontSize: 12.5, fontStyle: "italic", color: "var(--brand)" }}>
                          {coach.script}
                        </span>
                        <button
                          type="button"
                          className="btn btn--sm btn--ghost"
                          onClick={() => copyScript(coach.script)}
                          style={{ fontSize: 11, padding: "2px 8px", height: 26 }}
                        >
                          {copiedScript === coach.script ? t("rec.copiedBtn") : t("rec.copy")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="alert alert--olive">
            <span>🌟</span>
            <span>{t("rec.perfect")}</span>
          </div>
        )}

        {/* Strengths / What was done well */}
        {passed.length > 0 ? (
          <div>
            <div className="small faint" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              ✅ {t("rec.strengths")} ({passed.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {passed.map((r) => {
                const c = evaluation.checklist.criteria.find((x) => x.id === r.criterionId);
                const title = critTitle(r.code, c?.title);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      if (onSelectCriterion) {
                        onSelectCriterion(r.id);
                      } else if (r.evidenceIdx.length > 0 && onJump) {
                        onJump(r.evidenceIdx[0]);
                      }
                    }}
                    className="badge badge--green"
                    style={{ padding: "5px 10px", fontSize: 12, cursor: "pointer", border: "none" }}
                    title={loc(r.explanation) || t("rec.clickToInspect")}
                  >
                    ✓ {r.code}: {title} ↗
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Quick Recommended Speech Scripts Cheat-Sheet */}
        <div style={{ marginTop: 6, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div className="small faint" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            💬 {t("rec.phrases")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
            {phrases.map((p, idx) => (
              <div
                key={idx}
                style={{
                  background: "var(--surface-2)",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                }}
                onClick={() => copyScript(p.full)}
                title={t("rec.copy")}
              >
                <div className="small" style={{ fontWeight: 600, color: "var(--text-2)", marginBottom: 2 }}>
                  {p.label}
                </div>
                <div style={{ fontSize: 12, fontStyle: "italic", color: "var(--text)" }}>
                  {p.preview}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
