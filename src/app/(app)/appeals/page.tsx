"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { AppealDto } from "@/lib/types";

type Item = AppealDto & { conversationId: string; criterionCode: string; criterionTitle: string; originalTotal: number; finalTotal: number };
type Tab = "open" | "resolved" | "all";

export default function AppealsPage() {
  const { t, num, lang } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("open");
  const [items, setItems] = useState<Item[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    setItems(null);
    api<{ items: Item[]; counts: Record<string, number> }>(`/api/appeals?status=${tab === "all" ? "" : tab}`)
      .then((r) => {
        setItems(r.items);
        setCounts(r.counts);
      })
      .catch((e) => toast(e.message, "error"));
  }, [tab, toast]);

  const resolved = (counts.CONFIRMED ?? 0) + (counts.CHANGED ?? 0);
  const fmtDate = (s: string) => new Date(s).toLocaleString(lang === "EN" ? "en-GB" : "ru-RU", { dateStyle: "short", timeStyle: "short" });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("appeals.title")}</h1>
          <div className="page-head__sub">{t("appeals.subtitle")}</div>
        </div>
        <div className="tabs" role="tablist">
          {(["open", "resolved", "all"] as Tab[]).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {t(`appeals.tab.${k}`)} <span className="faint">{k === "open" ? counts.OPEN ?? 0 : k === "resolved" ? resolved : (counts.OPEN ?? 0) + resolved}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="card">
        {items === null ? (
          <div className="empty"><Spinner /> {t("common.loading")}</div>
        ) : items.length === 0 ? (
          <div className="empty">{t("appeals.empty")}</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("appeals.col.dialog")}</th>
                  <th>{t("appeals.col.criterion")}</th>
                  <th>{t("appeals.col.comment")}</th>
                  <th>{t("appeals.col.status")}</th>
                  <th className="num">{t("appeals.col.total")}</th>
                  <th>{t("appeals.col.created")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} onClick={() => router.push(`/appeals/${a.id}`)}>
                    <td className="mono" style={{ fontWeight: 600 }}>{a.conversationId}</td>
                    <td><span className="faint mono">{a.criterionCode}</span> {a.criterionTitle}</td>
                    <td className="clip muted">{a.comment}</td>
                    <td>
                      <span className={`badge ${a.status === "OPEN" ? "badge--warn" : a.status === "CHANGED" ? "badge--info" : "badge--green"}`}>{t(`appeals.status.${a.status}`)}</span>
                    </td>
                    <td className="num">
                      {a.status === "OPEN" ? num(a.finalTotal) : <>{num(a.totalBefore)} → <b>{num(a.totalAfter)}</b></>}
                    </td>
                    <td className="small faint">{fmtDate(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
