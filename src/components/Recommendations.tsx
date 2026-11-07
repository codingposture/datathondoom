"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useToast } from "./Toast";
import { Spinner } from "./ui";
import { api } from "@/lib/client";
import type { ConversationDto, EvaluationDto, MessageDto } from "@/lib/types";

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

// Pre-defined expert coaching templates based on standard contact center QA criteria
const CRITERIA_COACHING: Record<string, { advice: string; script: string; tag: string }> = {
  C1: {
    advice: "Всегда называйте имя и компанию в первом сообщении оператора. Это формирует доверие и персональный контакт с первых секунд.",
    script: "«Здравствуйте! Меня зовут [Имя], служба поддержки Freedom Broker. Чем я могу вам помочь?»",
    tag: "Приветствие",
  },
  C2: {
    advice: "Задавайте открытые или уточняющие вопросы до того, как переходить к решению. Это исключает неверные предположения и экономит время клиента.",
    script: "«Подскажите, пожалуйста, какая именно ошибка появляется на экране?»",
    tag: "Потребность",
  },
  C3: {
    advice: "Предоставляйте пошаговый алгоритм действий с четкими названиями разделов и кнопок. Убедитесь, что клиент понял каждый шаг.",
    script: "«Для этого откройте приложение, перейдите в раздел 'Меню' -> 'Настройки' и нажмите 'Подтвердить'. Получилось?»",
    tag: "Консультация",
  },
  C4: {
    advice: "КРИТИЧЕСКИ ВАЖНО: Категорически запрещено запрашивать пароли, PIN, CVV/CVC, полный номер карты или предлагать перевести средства на личные счета.",
    script: "«В целях вашей безопасности сотрудники поддержки никогда не запрашивают пароли или PIN-коды.»",
    tag: "Безопасность",
  },
  C5: {
    advice: "Используйте слова вежливости ('пожалуйста', 'благодарю') и проявляйте эмпатию, если клиент расстроен или столкнулся со сложностями.",
    script: "«Понимаю ваше беспокойство, давайте вместе разберемся в этой ситуации.»",
    tag: "Тон и эмпатия",
  },
  C6: {
    advice: "Если поиск информации или проверка данных займет более 60 секунд, обязательно предупредите клиента и поблагодарите за ожидание.",
    script: "«Мне потребуется 1-2 минуты для уточнения информации. Пожалуйста, оставайтесь на линии.»",
    tag: "Ожидание",
  },
  C7: {
    advice: "При передаче вопроса в профильный отдел или бэк-офис всегда фиксируйте точный срок решения или обратной связи.",
    script: "«Я зафиксировал обращение и передал его специалистам. Ответ поступит вам в течение 24 часов в приложении.»",
    tag: "Эскалация",
  },
  C8: {
    advice: "Перед завершением диалога уточните, остались ли другие вопросы, и вежливо попрощайтесь.",
    script: "«Подскажите, остались ли у вас еще вопросы? Был рад помочь, хорошего вам дня!»",
    tag: "Завершение",
  },
  V1: {
    advice: "Следите за интонацией речи: избегайте монотонного механического чтения скрипта, делайте смысловые акценты на ключевых фразах.",
    script: "«Поддерживайте открытый, доброжелательный тембр голоса.»",
    tag: "Интонация",
  },
  V2: {
    advice: "Не перебивайте клиента, дайте ему договорить мысль до конца. Делайте паузу в 1-1.5 секунды перед началом своего ответа.",
    script: "«Если случайно перебили: 'Прошу прощения, продолжайте, пожалуйста.'»",
    tag: "Перебивания",
  },
  V3: {
    advice: "Избегайте мертвого эфира (dead air) дольше 5 секунд. Если нужно посмотреть данные, озвучивайте свои действия клиенту.",
    script: "«Секунду, сверяю данные в системе...»",
    tag: "Паузы",
  },
  V4: {
    advice: "Если клиент говорит на повышенных тонах или волнуется, сохраняйте спокойный, ровный темп речи и мягкую интонацию.",
    script: "«Я вас услышал, не переживайте, мы решим этот вопрос прямо сейчас.»",
    tag: "Спокойствие",
  },
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
  const { t, loc } = useI18n();
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
        `/api/conversations/${encodeURIComponent(conversation.id)}/recommendations`
      );
      setAiData(data);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoadingAi(false);
    }
  };

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
                const coach = CRITERIA_COACHING[r.code] || {
                  advice: loc(r.explanation),
                  script: "",
                  tag: c?.title || r.code,
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
                          {r.code}: {c?.title || coach.tag} ↗
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
                    ✓ {r.code}: {c?.title} ↗
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
            <div
              style={{
                background: "var(--surface-2)",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                cursor: "pointer",
              }}
              onClick={() => copyScript("Здравствуйте! Меня зовут [Имя], Freedom Broker. Чем я могу вам помочь?")}
              title="Нажмите, чтобы скопировать"
            >
              <div className="small" style={{ fontWeight: 600, color: "var(--text-2)", marginBottom: 2 }}>
                Приветствие:
              </div>
              <div style={{ fontSize: 12, fontStyle: "italic", color: "var(--text)" }}>
                «Здравствуйте! Меня зовут [Имя], Freedom Broker. Чем могу помочь?»
              </div>
            </div>

            <div
              style={{
                background: "var(--surface-2)",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                cursor: "pointer",
              }}
              onClick={() => copyScript("Мне потребуется 1-2 минуты для проверки информации. Пожалуйста, оставайтесь на связи.")}
              title="Нажмите, чтобы скопировать"
            >
              <div className="small" style={{ fontWeight: 600, color: "var(--text-2)", marginBottom: 2 }}>
                Ожидание / Пауза:
              </div>
              <div style={{ fontSize: 12, fontStyle: "italic", color: "var(--text)" }}>
                «Мне потребуется 1-2 минуты для проверки. Пожалуйста, ожидайте.»
              </div>
            </div>

            <div
              style={{
                background: "var(--surface-2)",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                cursor: "pointer",
              }}
              onClick={() => copyScript("Я зафиксировал ваш запрос и передал профильным специалистам. Ответ поступит в течение 24 часов.")}
              title="Нажмите, чтобы скопировать"
            >
              <div className="small" style={{ fontWeight: 600, color: "var(--text-2)", marginBottom: 2 }}>
                Передача со сроком:
              </div>
              <div style={{ fontSize: 12, fontStyle: "italic", color: "var(--text)" }}>
                «Передал вопрос специалистам, ответ поступит в течение 24 часов.»
              </div>
            </div>

            <div
              style={{
                background: "var(--surface-2)",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                cursor: "pointer",
              }}
              onClick={() => copyScript("Остались ли у вас еще вопросы? Был рад помочь вам, хорошего дня!")}
              title="Нажмите, чтобы скопировать"
            >
              <div className="small" style={{ fontWeight: 600, color: "var(--text-2)", marginBottom: 2 }}>
                Завершение диалога:
              </div>
              <div style={{ fontSize: 12, fontStyle: "italic", color: "var(--text)" }}>
                «Остались ли вопросы? Был рад помочь, хорошего дня!»
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
