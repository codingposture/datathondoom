"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { ChecklistDef } from "@/lib/types";

type Item = ChecklistDef & { evaluationCount: number };

export default function ChecklistsPage() {
  const { t, num, lang } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);

  const load = useCallback(() => api<Item[]>("/api/checklists").then(setItems).catch((e) => toast(e.message, "error")), [toast]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (path: string, after?: (r: ChecklistDef) => void) => {
    try {
      const r = await api<ChecklistDef>(path, { method: "POST" });
      await load();
      after?.(r);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  // Group versions by family; show the latest version of each family first.
  const families = new Map<string, Item[]>();
  for (const it of items ?? []) families.set(it.family, [...(families.get(it.family) ?? []), it]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("checklists.title")}</h1>
          <div className="page-head__sub">{t("checklists.subtitle")}</div>
        </div>
        <Link href="/checklists/new" className="btn btn--primary">+ {t("checklists.new")}</Link>
      </div>

      {items === null ? (
        <div className="card empty"><Spinner /> {t("common.loading")}</div>
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          {[...families.values()].map((versions) => {
            const sorted = [...versions].sort((a, b) => b.version - a.version);
            const latest = sorted[0];
            return (
              <div key={latest.family} className="card">
                <div className="card__head">
                  <div className="row">
                    <h2>{latest.name}</h2>
                    {versions.some((v) => v.isActive) ? <span className="badge badge--green">{t("common.active")}</span> : null}
                  </div>
                  <div className="row">
                    <button className="btn btn--sm" onClick={() => act(`/api/checklists/${latest.id}/duplicate`, (r) => router.push(`/checklists/${r.id}`))}>{t("checklists.duplicate")}</button>
                    <Link className="btn btn--sm btn--primary" href={`/checklists/${latest.id}`}>{t("checklists.edit")}</Link>
                  </div>
                </div>
                <div className="table-wrap" style={{ padding: "6px 6px 8px" }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t("common.version")}</th>
                        <th>{t("checklists.criteria", { n: "" }).replace(":", "").trim()}</th>
                        <th>{t("checklists.weightSum", { n: "" }).replace(":", "").trim()}</th>
                        <th>{t("checklists.settings")}</th>
                        <th className="num">{t("checklists.evaluations", { n: "" }).replace(":", "").trim()}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((v) => (
                        <tr key={v.id} onClick={() => router.push(`/checklists/${v.id}`)}>
                          <td>
                            <b>v{v.version}</b> <span className="faint small">{v.createdAt ? new Date(v.createdAt).toLocaleString(lang === "EN" ? "en-GB" : "ru-RU") : ""}</span>
                          </td>
                          <td>{v.criteria.length} <span className="faint small">· {v.criteria.map((c) => c.code).join(", ")}</span></td>
                          <td>{num(v.criteria.reduce((s, c) => s + c.weight, 0))}</td>
                          <td className="small muted">
                            {t(`checklists.rounding.${v.roundingMode}`)}, {v.decimals} · {t(`checklists.criticalPolicy.${v.criticalPolicy}`)}
                          </td>
                          <td className="num">{v.evaluationCount}</td>
                          <td className="num" onClick={(e) => e.stopPropagation()}>
                            {v.isActive ? (
                              <span className="badge badge--green">★ {t("common.active")}</span>
                            ) : (
                              <button className="btn btn--sm btn--ghost" onClick={() => act(`/api/checklists/${v.id}/activate`)}>{t("checklists.activate")}</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
