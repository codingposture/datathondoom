"use client";

import { normalize } from "@/lib/scoring";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { Answer, CriterionDef } from "@/lib/types";

export function ScorePill({ value, critical }: { value: number | null | undefined; critical?: boolean }) {
  const { num } = useI18n();
  if (value === null || value === undefined) return <span className="faint">—</span>;
  const cls = critical || value < 60 ? "lo" : value < 85 ? "mid" : "hi";
  return <span className={`score-pill score-pill--${cls}`}>{num(value)}</span>;
}

export type AnswerState = "ok" | "part" | "fail" | "na";

export function answerState(c: Pick<CriterionDef, "answerType" | "scaleMin" | "scaleMax"> | undefined, answer: Answer): AnswerState {
  if (answer === "na") return "na";
  if (!c) return answer === "yes" ? "ok" : "fail";
  const n = normalize(c, answer) ?? 0;
  return n >= 1 ? "ok" : n <= 0 ? "fail" : "part";
}

export function StateIcon({ state }: { state: AnswerState }) {
  const glyph = { ok: "✓", part: "◐", fail: "✕", na: "N/A" }[state];
  return <span className={`crit__icon crit__icon--${state}`} aria-hidden>{glyph}</span>;
}

export function useAnswerLabel() {
  const { t } = useI18n();
  return (c: CriterionDef | undefined, answer: Answer) => {
    if (answer === "na") return t("common.na");
    if (!c || c.answerType === "BINARY") return answer === "yes" ? t("common.yes") : t("common.no");
    return `${answer} / ${c.scaleMax}`;
  };
}

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <div className="modal__head">
          <h2>{title}</h2>
          <button className="btn btn--ghost btn--icon" onClick={onClose} aria-label="close">✕</button>
        </div>
        <div className="modal__body">{children}</div>
        {footer ? <div className="modal__foot">{footer}</div> : null}
      </div>
    </div>
  );
}
