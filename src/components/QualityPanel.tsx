"use client";

import { useI18n } from "@/lib/i18n/I18nProvider";
import type { CriterionResultDto, EvaluationDto, MessageDto } from "@/lib/types";
import { ScoreRing } from "./ScoreRing";
import { answerState, StateIcon, useAnswerLabel } from "./ui";

type Props = {
  evaluation: EvaluationDto;
  messages: MessageDto[];
  selectedId: string | null;
  onSelect: (resultId: string) => void;
  onJump: (idx: number) => void;
  onGoToFragment: (r: CriterionResultDto) => void;
  onDispute: (r: CriterionResultDto | null) => void;
};

export function QualityPanel({ evaluation, messages, selectedId, onSelect, onJump, onGoToFragment, onDispute }: Props) {
  const { t, num, loc, critTitle, secName, clName } = useI18n();
  const answerLabel = useAnswerLabel();
  const ev = evaluation;
  const crit = (r: CriterionResultDto) => ev.checklist.criteria.find((c) => c.id === r.criterionId);
  const selected = ev.results.find((r) => r.id === selectedId) ?? null;
  const changedByAppeal = ev.finalTotal !== ev.originalTotal || ev.appeals.some((a) => a.status === "CHANGED");
  const sections = ev.finalSections.length ? ev.finalSections : ev.sectionScores;
  const lowered = ev.results.filter((r) => r.finalAnswer !== "na" && r.finalPoints < r.finalMaxPoints);
  const appealFor = (r: CriterionResultDto) => ev.appeals.filter((a) => a.criterionResultId === r.id).at(-1);
  const byIdx = new Map(messages.map((m) => [m.idx, m]));

  return (
    <div className="card">
      <div className="card__head">
        <h2>{t("card.quality")}</h2>
        {ev.finalCritical ? <span className="badge badge--danger">⚠ {t("card.critical")}</span> : null}
      </div>
      <div className="card__body stack">
        <div className="quality__top">
          <ScoreRing value={ev.finalTotal} was={changedByAppeal ? ev.originalTotal : null} critical={ev.finalCritical} />
          <div className="crit-list">
            {ev.results.map((r) => {
              const c = crit(r);
              const state = answerState(c, r.finalAnswer);
              const appeal = appealFor(r);
              const changed = r.finalAnswer !== r.answer;
              return (
                <button key={r.id} type="button" className={`crit ${selectedId === r.id ? "crit--selected" : ""}`} onClick={() => onSelect(r.id)}>
                  <StateIcon state={state} />
                  <span className="crit__title" title={critTitle(r.code, c?.title)}>
                    {c?.isCritical ? <span style={{ color: "var(--danger)" }}>● </span> : null}
                    {critTitle(r.code, c?.title)}
                    {appeal?.status === "OPEN" ? <span className="badge badge--warn" style={{ marginLeft: 6 }}>{t("card.appealOpen")}</span> : null}
                  </span>
                  <span className={`crit__score ${state === "ok" ? "crit__score--ok" : state === "fail" ? "crit__score--fail" : ""}`}>
                    {changed ? <span className="crit__was">{num(r.points)}</span> : null}
                    {state === "na" ? "N/A" : `${num(r.finalPoints)} / ${num(r.finalMaxPoints)}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {ev.finalCritical ? (
          <div className="alert alert--danger">
            <span>⚠</span>
            <span>
              <b>{t("card.critical")}.</b> {t("card.criticalHint")}:{" "}
              {ev.results
                .filter((r) => crit(r)?.isCritical && answerState(crit(r), r.finalAnswer) !== "ok" && r.finalAnswer !== "na")
                .map((r) => critTitle(r.code, crit(r)?.title))
                .join(", ")}
            </span>
          </div>
        ) : null}

        {sections.length ? (
          <div>
            <div className="small faint" style={{ marginBottom: 6 }}>{t("card.sections")}</div>
            <div className="sections">
              {sections.map((s) => (
                <div key={s.key} className="section-chip">
                  <div className="section-chip__name">{secName(s.key, s.name)}</div>
                  <div className="section-chip__val">{s.percent === null ? "N/A" : `${num(s.points)} / ${num(s.maxPoints)}`}</div>
                  <div className="bar"><i style={{ width: `${s.percent ?? 0}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <hr className="divider" style={{ margin: "4px 0" }} />

        {selected ? (
          <CriterionDetail
            r={selected}
            title={critTitle(selected.code, crit(selected)?.title)}
            weight={crit(selected)?.weight}
            answer={answerLabel(crit(selected), selected.finalAnswer)}
            originalAnswer={selected.finalAnswer !== selected.answer ? answerLabel(crit(selected), selected.answer) : null}
            naRule={crit(selected)?.naRule}
            messages={byIdx}
            onJump={onJump}
          />
        ) : (
          <div className="why">
            <div className="why__title">{t("card.whyLowered")}</div>
            {lowered.length ? (
              <div className="stack" style={{ gap: 6 }}>
                {lowered.map((r) => (
                  <div key={r.id} className="small">
                    <a href={`#msg-${r.evidenceIdx[0] ?? r.checkedFrom ?? 0}`} onClick={(e) => { e.preventDefault(); onSelect(r.id); }} style={{ fontWeight: 600 }}>
                      {critTitle(r.code, crit(r)?.title)}
                    </a>
                    {": "}
                    <span className="muted">{loc(r.explanation)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">{t("card.allGood")}</div>
            )}
          </div>
        )}

        <div className="row">
          <button className="btn btn--primary" onClick={() => onGoToFragment(selected ?? lowered[0] ?? ev.results[0])}>
            {t("card.goToFragment")}
          </button>
          <button className="btn" onClick={() => onDispute(selected ?? lowered[0] ?? null)}>
            {t("card.dispute")}
          </button>
        </div>

        {ev.appeals.length ? (
          <div>
            <div className="small faint" style={{ marginBottom: 6 }}>{t("card.history")}</div>
            <div className="stack" style={{ gap: 6 }}>
              {ev.appeals.map((a) => {
                const r = ev.results.find((x) => x.id === a.criterionResultId);
                return (
                  <a key={a.id} href={`/appeals/${a.id}`} className="alert alert--olive small" style={{ display: "block" }}>
                    <b>{r ? critTitle(r.code, crit(r)?.title) : ""}</b> —{" "}
                    <span className={`badge ${a.status === "OPEN" ? "badge--warn" : a.status === "CHANGED" ? "badge--info" : "badge--green"}`}>{t(`appeals.status.${a.status}`)}</span>
                    {a.status !== "OPEN" && a.totalBefore !== null ? <> · {t("appeals.totalChange", { before: num(a.totalBefore), after: num(a.totalAfter) })}</> : null}
                    <div className="muted" style={{ marginTop: 2 }}>«{a.comment}»{a.reviewerReason ? <> → {a.reviewerReason}</> : null}</div>
                  </a>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="small faint">
          {t("card.original")}: <b>{num(ev.originalTotal)}</b> · {t("card.final")}: <b>{num(ev.finalTotal)}</b> ·{" "}
          {t("card.checklistUsed", { name: clName(ev.checklist.name), version: ev.checklist.version })} · {t("card.evaluator", { name: ev.evaluator })}
        </div>
      </div>
    </div>
  );
}

function CriterionDetail({
  r,
  title,
  weight,
  answer,
  originalAnswer,
  naRule,
  messages,
  onJump,
}: {
  r: CriterionResultDto;
  title: string;
  weight?: number;
  answer: string;
  originalAnswer: string | null;
  naRule?: string;
  messages: Map<number, MessageDto>;
  onJump: (idx: number) => void;
}) {
  const { t, num, loc } = useI18n();
  return (
    <div className="detail">
      <div className="detail__title">{title}</div>
      <dl>
        <dt>{t("card.answer")}</dt>
        <dd>
          {originalAnswer ? <><s className="faint">{originalAnswer}</s> → </> : null}
          <b>{answer}</b>
        </dd>
        <dt>{t("common.points")}</dt>
        <dd>
          {r.finalAnswer === "na" ? "—" : `${num(r.finalPoints)} / ${num(r.finalMaxPoints)}`}
        </dd>
        <dt>{t("common.weight")}</dt>
        <dd>
          {weight ?? "—"}
          {r.finalAnswer !== "na" ? <span className="faint"> → {num(r.finalMaxPoints)}%</span> : null}
        </dd>
        <dt>{t("card.explanation")}</dt>
        <dd>{loc(r.explanation)}</dd>
        {r.finalAnswer === "na" || r.answer === "na" ? (
          <>
            <dt>{t("card.naReason")}</dt>
            <dd>{loc(r.naReason) || naRule || "—"}</dd>
          </>
        ) : null}
        {r.evidenceIdx.length ? (
          <>
            <dt>{t("card.evidence")}</dt>
            <dd>
              {r.evidenceIdx.map((i) => {
                const m = messages.get(i);
                return (
                  <a key={i} href={`#msg-${i}`} className="quote" onClick={(e) => { e.preventDefault(); onJump(i); }}>
                    <span className="faint small">#{i} · {m ? t(`speaker.${m.speaker}`) : ""} </span>
                    {m ? (m.text.length > 160 ? m.text.slice(0, 157) + "…" : m.text) : ""}
                  </a>
                );
              })}
            </dd>
          </>
        ) : null}
        {r.checkedFrom !== null && r.checkedTo !== null ? (
          <>
            <dt>{t("card.checkedRange")}</dt>
            <dd>
              <a href={`#msg-${r.checkedFrom}`} onClick={(e) => { e.preventDefault(); onJump(r.checkedFrom!); }} style={{ textDecoration: "underline" }}>
                {t("card.messagesRange", { from: r.checkedFrom, to: r.checkedTo })}
              </a>
            </dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}
