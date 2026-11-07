"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { ScoreRing } from "@/components/ScoreRing";
import { useToast } from "@/components/Toast";
import { Transcript } from "@/components/Transcript";
import { answerState, Spinner, StateIcon, useAnswerLabel } from "@/components/ui";
import { api } from "@/lib/client";
import { scaleValues } from "@/lib/scoring";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { AppealDto, ConversationDto, CriterionDef, CriterionResultDto, EvaluationDto, MessageDto } from "@/lib/types";

type Data = {
  appeal: AppealDto;
  result: CriterionResultDto;
  criterion: CriterionDef | null;
  evaluation: EvaluationDto;
  conversation: ConversationDto;
  fragment: MessageDto[];
};

export default function AppealReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, num, loc, lang } = useI18n();
  const toast = useToast();
  const answerLabel = useAnswerLabel();
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<"confirm" | "change">("change");
  const [newAnswer, setNewAnswer] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      api<Data>(`/api/appeals/${id}`)
        .then((x) => {
          setD(x);
          setNewAnswer((cur) => cur || x.result.finalAnswer);
        })
        .catch((e) => setError(e.message)),
    [id],
  );
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <div className="card empty">{t("common.error")}: {error}</div>;
  if (!d) return <div className="card empty"><Spinner /> {t("common.loading")}</div>;

  const { appeal, result, criterion: c, evaluation } = d;
  const options: string[] = !c
    ? ["yes", "no"]
    : c.answerType === "BINARY"
      ? ["yes", "no"]
      : scaleValues(c).map(String);
  if (c?.naAllowed) options.push("na");
  const decided = appeal.status !== "OPEN";

  const submit = async () => {
    setBusy(true);
    try {
      await api(`/api/appeals/${id}/decision`, { method: "POST", json: { action, reason, newAnswer: action === "change" ? newAnswer : undefined } });
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/appeals" className="crumb">← {t("nav.appeals")}</Link>
          <h1>{t("appeals.review")}</h1>
          <div className="page-head__meta">
            <span className="mono">{d.conversation.id}</span>·<span>{t(`lang.${d.conversation.language}`)}</span>·
            <span className={`badge ${appeal.status === "OPEN" ? "badge--warn" : appeal.status === "CHANGED" ? "badge--info" : "badge--green"}`}>{t(`appeals.status.${appeal.status}`)}</span>
          </div>
        </div>
        <Link className="btn" href={`/dialogs/${encodeURIComponent(d.conversation.id)}?criterion=${encodeURIComponent(result.code)}#msg-${result.evidenceIdx[0] ?? result.checkedFrom ?? 0}`}>
          {t("appeals.openDialog")}
        </Link>
      </div>

      <div className="grid-analysis" style={{ marginTop: 0 }}>
        <div className="stack" style={{ gap: 18 }}>
          <div className="card card--pad stack">
            <h2>{t("appeals.disputed")}</h2>
            <div className="row">
              <StateIcon state={answerState(c ?? undefined, result.answer)} />
              <b>{c?.title ?? result.code}</b>
              {c?.isCritical ? <span className="badge badge--danger">{t("card.critical")}</span> : null}
            </div>
            <div className="detail">
              <dl>
                <dt>{t("card.answer")}</dt>
                <dd><b>{answerLabel(c ?? undefined, appeal.previousAnswer)}</b></dd>
                <dt>{t("common.points")}</dt>
                <dd>{result.answer === "na" ? "—" : `${num(result.points)} / ${num(result.maxPoints)}`}</dd>
                <dt>{t("common.weight")}</dt>
                <dd>{c?.weight ?? "—"}</dd>
                <dt>{t("card.explanation")}</dt>
                <dd>{loc(result.explanation)}</dd>
                {result.naReason ? (<><dt>{t("card.naReason")}</dt><dd>{loc(result.naReason)}</dd></>) : null}
                {c?.description ? (<><dt>{t("checklists.description")}</dt><dd className="muted">{c.description}</dd></>) : null}
              </dl>
            </div>
            <div>
              <div className="small faint" style={{ marginBottom: 4 }}>{t("appeals.appellantComment")}</div>
              <div className="alert alert--olive">«{appeal.comment}»</div>
            </div>
          </div>

          <div className="card">
            <div className="card__head"><h2>{t("appeals.fragment")}</h2></div>
            <Transcript
              messages={d.fragment}
              activeIdx={null}
              evidence={result.evidenceIdx}
              range={result.checkedFrom !== null && result.checkedTo !== null ? { from: result.checkedFrom, to: result.checkedTo } : null}
              playingIdx={null}
              maxHeight={420}
            />
          </div>
        </div>

        <div className="card card--pad stack">
          <h2>{t("appeals.decision")}</h2>
          <div className="row" style={{ gap: 20 }}>
            <ScoreRing value={evaluation.finalTotal} was={evaluation.finalTotal !== evaluation.originalTotal ? evaluation.originalTotal : null} critical={evaluation.finalCritical} />
            <div className="stack small" style={{ gap: 4 }}>
              <div>{t("card.original")}: <b>{num(evaluation.originalTotal)}</b></div>
              <div>{t("card.final")}: <b>{num(evaluation.finalTotal)}</b></div>
              {evaluation.finalCritical ? <span className="badge badge--danger">⚠ {t("card.critical")}</span> : null}
            </div>
          </div>

          {decided ? (
            <div className="stack">
              <div className={`alert ${appeal.status === "CHANGED" ? "alert--info" : "alert--olive"}`}>
                <div>
                  <b>{t(`appeals.status.${appeal.status}`)}</b>
                  {appeal.status === "CHANGED" ? <> : {answerLabel(c ?? undefined, appeal.previousAnswer)} → <b>{answerLabel(c ?? undefined, appeal.newAnswer ?? "")}</b></> : null}
                  <div style={{ marginTop: 4 }}>{t("appeals.totalChange", { before: num(appeal.totalBefore), after: num(appeal.totalAfter) })}</div>
                  <div className="muted" style={{ marginTop: 4 }}>{t("appeals.reason")}: {appeal.reviewerReason}</div>
                  {appeal.decidedAt ? <div className="faint small" style={{ marginTop: 4 }}>{t("appeals.decidedAt")}: {new Date(appeal.decidedAt).toLocaleString(lang === "EN" ? "en-GB" : "ru-RU")}</div> : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="stack">
              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={action === "confirm"} onClick={() => setAction("confirm")}>{t("appeals.confirm")}</button>
                <button role="tab" aria-selected={action === "change"} onClick={() => setAction("change")}>{t("appeals.change")}</button>
              </div>
              {action === "change" ? (
                <label className="field">
                  <span>{t("appeals.newAnswer")}</span>
                  <select className="select" value={newAnswer} onChange={(e) => setNewAnswer(e.target.value)}>
                    {options.map((o) => (
                      <option key={o} value={o}>{answerLabel(c ?? undefined, o)}{o === result.finalAnswer ? " ●" : ""}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="field">
                <span>{t("appeals.reason")}</span>
                <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("appeals.reasonPh")} />
              </label>
              <div>
                <button className="btn btn--primary" onClick={submit} disabled={busy || !reason.trim() || (action === "change" && newAnswer === result.finalAnswer)}>
                  {busy ? <Spinner /> : null}
                  {t("appeals.saveDecision")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
