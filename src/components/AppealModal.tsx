"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { EvaluationDto } from "@/lib/types";
import { useToast } from "./Toast";
import { Modal, Spinner, useAnswerLabel } from "./ui";

export function AppealModal({ evaluation, initialResultId, onClose, onSaved }: { evaluation: EvaluationDto; initialResultId: string | null; onClose: () => void; onSaved: () => void }) {
  const { t, num, loc } = useI18n();
  const toast = useToast();
  const answerLabel = useAnswerLabel();
  const openIds = new Set(evaluation.appeals.filter((a) => a.status === "OPEN").map((a) => a.criterionResultId));
  const firstFree = evaluation.results.find((r) => !openIds.has(r.id))?.id ?? "";
  const [resultId, setResultId] = useState(initialResultId && !openIds.has(initialResultId) ? initialResultId : firstFree);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const r = evaluation.results.find((x) => x.id === resultId);
  const c = r ? evaluation.checklist.criteria.find((x) => x.id === r.criterionId) : undefined;

  const submit = async () => {
    setBusy(true);
    try {
      await api("/api/appeals", { method: "POST", json: { criterionResultId: resultId, comment } });
      toast(t("appeal.submitted"));
      onSaved();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t("appeal.title")}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn btn--primary" disabled={!resultId || !comment.trim() || busy} onClick={submit}>
            {busy ? <Spinner /> : null}
            {t("appeal.submit")}
          </button>
        </>
      }
    >
      <label className="field">
        <span>{t("appeal.criterion")}</span>
        <select className="select" value={resultId} onChange={(e) => setResultId(e.target.value)}>
          {evaluation.results.map((x) => {
            const cc = evaluation.checklist.criteria.find((k) => k.id === x.criterionId);
            const busyAppeal = openIds.has(x.id);
            return (
              <option key={x.id} value={x.id} disabled={busyAppeal}>
                {cc?.title ?? x.code} — {answerLabel(cc, x.finalAnswer)}
                {busyAppeal ? ` (${t("appeal.exists")})` : ""}
              </option>
            );
          })}
        </select>
      </label>
      {r ? (
        <div className="detail small">
          <div>
            <b>{t("card.answer")}:</b> {answerLabel(c, r.finalAnswer)} · <b>{t("common.points")}:</b>{" "}
            {r.finalAnswer === "na" ? "—" : `${num(r.finalPoints)} / ${num(r.finalMaxPoints)}`}
          </div>
          <div className="muted" style={{ marginTop: 4 }}>{loc(r.explanation)}</div>
        </div>
      ) : null}
      <label className="field">
        <span>{t("appeal.comment")}</span>
        <textarea className="textarea" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("appeal.commentPh")} autoFocus />
      </label>
    </Modal>
  );
}
