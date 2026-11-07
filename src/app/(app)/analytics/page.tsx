"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useToast } from "@/components/Toast";
import { ScorePill, Spinner } from "@/components/ui";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { ChecklistDef } from "@/lib/types";

type Data = {
  totals: {
    conversations: number;
    evaluated: number;
    avgScore: number | null;
    avgOriginal: number | null;
    criticalErrors: number;
    appeals: number;
    appealsOpen: number;
    appealsChanged: number;
    appealsConfirmed: number;
  };
  byLanguage: { name: string; avg: number | null; count: number }[];
  byChannel: { name: string; avg: number | null; count: number }[];
  criteria: { code: string; title: string; passRate: number | null; naRate: number | null; count: number }[];
  distribution: { range: string; count: number }[];
  lowest: { id: string; language: string; channel: string; total: number; critical: boolean }[];
};

// Single-series charts: one hue (brand green), recessive grid, text in ink tokens.
const MARK = "#3f8f3a";
const GRID = "#ebe7d8";
const INK = "#5d5b4e";
const axis = { stroke: GRID, tick: { fill: INK, fontSize: 12 }, tickLine: false };

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: { value: number; payload: Record<string, unknown> }[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", boxShadow: "var(--shadow)", fontSize: 12.5 }}>
      <div style={{ fontWeight: 650 }}>{(p.payload.title as string) ?? label}</div>
      <div style={{ color: "var(--text-2)" }}>
        {p.value}
        {unit ?? ""}
        {typeof p.payload.count === "number" ? ` · n=${p.payload.count}` : ""}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { t, num } = useI18n();
  const toast = useToast();
  const [d, setD] = useState<Data | null>(null);
  const [groups, setGroups] = useState<{ groupId: string; count: number }[]>([]);
  const [checklists, setChecklists] = useState<ChecklistDef[]>([]);
  const [groupId, setGroupId] = useState("");
  const [checklistId, setChecklistId] = useState("");

  useEffect(() => {
    api<{ groups: { groupId: string; count: number }[] }>("/api/conversations").then((r) => setGroups(r.groups)).catch(() => {});
    api<ChecklistDef[]>("/api/checklists").then(setChecklists).catch(() => {});
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams({ ...(groupId ? { groupId } : {}), ...(checklistId ? { checklistId } : {}) });
    api<Data>(`/api/analytics?${qs}`).then(setD).catch((e) => toast(e.message, "error"));
  }, [groupId, checklistId, toast]);

  const langData = d?.byLanguage.map((x) => ({ ...x, label: x.name, title: t(`lang.${x.name as "RU"}`) ?? x.name })) ?? [];
  const chanData = d?.byChannel.map((x) => ({ ...x, label: t(`channel.${x.name as "agent chat"}`), title: t(`channel.${x.name as "agent chat"}`) })) ?? [];
  const critData = d?.criteria.map((c) => ({ ...c, label: c.code })) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("analytics.title")}</h1>
          <div className="page-head__sub">{t("analytics.subtitle")}</div>
        </div>
        <div className="row">
          <select className="select" value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label={t("dialogs.group")}>
            <option value="">{t("analytics.allGroups")}</option>
            {groups.map((g) => <option key={g.groupId} value={g.groupId}>{g.groupId} ({g.count})</option>)}
          </select>
          <select className="select" value={checklistId} onChange={(e) => setChecklistId(e.target.value)} aria-label={t("dialogs.checklist")}>
            <option value="">{t("analytics.allChecklists")}</option>
            {checklists.map((c) => <option key={c.id} value={c.id}>{c.name} v{c.version}</option>)}
          </select>
        </div>
      </div>

      {!d ? (
        <div className="card empty"><Spinner /> {t("common.loading")}</div>
      ) : (
        <>
          <div className="kpis">
            <div className="card kpi">
              <div className="kpi__label">{t("analytics.avg")}</div>
              <div className="kpi__value">{num(d.totals.avgScore)}</div>
              <div className="kpi__sub">{t("card.original")}: {num(d.totals.avgOriginal)}</div>
            </div>
            <div className="card kpi">
              <div className="kpi__label">{t("analytics.evaluated")}</div>
              <div className="kpi__value">{d.totals.evaluated}<span className="faint" style={{ fontSize: 18 }}> / {d.totals.conversations}</span></div>
              <div className="kpi__sub">{t("analytics.dialogs")}</div>
            </div>
            <div className="card kpi">
              <div className="kpi__label">{t("analytics.critical")}</div>
              <div className="kpi__value" style={{ color: d.totals.criticalErrors ? "var(--danger)" : undefined }}>
                {d.totals.criticalErrors ? "⚠ " : ""}{d.totals.criticalErrors}
              </div>
              <div className="kpi__sub">{t("card.criticalHint")}</div>
            </div>
            <div className="card kpi">
              <div className="kpi__label">{t("analytics.appeals")}</div>
              <div className="kpi__value">{d.totals.appeals}</div>
              <div className="kpi__sub">{t("analytics.appealsDetail", { open: d.totals.appealsOpen, changed: d.totals.appealsChanged })}</div>
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 18 }}>
            <div className="card chart-card">
              <h3>{t("analytics.criteria")}</h3>
              <ResponsiveContainer width="100%" height={Math.max(240, critData.length * 34)}>
                <BarChart data={critData} layout="vertical" margin={{ left: 0, right: 24, top: 4, bottom: 4 }} barCategoryGap={8}>
                  <CartesianGrid horizontal={false} stroke={GRID} />
                  <XAxis type="number" domain={[0, 100]} {...axis} unit="%" />
                  <YAxis type="category" dataKey="label" width={44} {...axis} axisLine={false} />
                  <Tooltip cursor={{ fill: "rgba(163,157,69,0.10)" }} content={<ChartTooltip unit="%" />} />
                  <Bar dataKey="passRate" fill={MARK} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
              <table className="table small" style={{ marginTop: 8 }}>
                <thead>
                  <tr><th /><th>{t("appeals.col.criterion")}</th><th className="num">{t("analytics.passRate")}</th><th className="num">{t("analytics.naRate")}</th></tr>
                </thead>
                <tbody>
                  {d.criteria.map((c) => (
                    <tr key={c.code} style={{ cursor: "default" }}>
                      <td className="mono faint">{c.code}</td>
                      <td>{c.title}</td>
                      <td className="num">{num(c.passRate)}</td>
                      <td className="num">{num(c.naRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="stack" style={{ gap: 18 }}>
              <div className="card chart-card" style={{ minHeight: 0 }}>
                <h3>{t("analytics.distribution")}</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={d.distribution} margin={{ left: -18, right: 8, top: 4 }} barCategoryGap={2}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="range" {...axis} interval={0} tick={{ fill: INK, fontSize: 11 }} />
                    <YAxis allowDecimals={false} {...axis} axisLine={false} />
                    <Tooltip cursor={{ fill: "rgba(163,157,69,0.10)" }} content={<ChartTooltip />} />
                    <Bar dataKey="count" fill={MARK} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid-2">
                {[
                  { title: t("analytics.byLanguage"), data: langData },
                  { title: t("analytics.byChannel"), data: chanData },
                ].map((g) => (
                  <div key={g.title} className="card chart-card" style={{ minHeight: 0 }}>
                    <h3>{g.title}</h3>
                    <ResponsiveContainer width="100%" height={170}>
                      <BarChart data={g.data} margin={{ left: -18, right: 8, top: 4 }}>
                        <CartesianGrid vertical={false} stroke={GRID} />
                        <XAxis dataKey="label" {...axis} />
                        <YAxis domain={[0, 100]} {...axis} axisLine={false} />
                        <Tooltip cursor={{ fill: "rgba(163,157,69,0.10)" }} content={<ChartTooltip />} />
                        <Bar dataKey="avg" fill={MARK} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>
              <div className="card chart-card" style={{ minHeight: 0 }}>
                <h3>{t("analytics.lowest")}</h3>
                {d.lowest.length ? (
                  <table className="table">
                    <tbody>
                      {d.lowest.map((x) => (
                        <tr key={x.id}>
                          <td><Link href={`/dialogs/${encodeURIComponent(x.id)}`} className="mono" style={{ fontWeight: 600 }}>{x.id}</Link></td>
                          <td className="small muted">{t(`channel.${x.channel as "agent chat"}`)} · {x.language}</td>
                          <td className="num">
                            {x.critical ? <span className="badge badge--danger" style={{ marginRight: 6 }}>⚠ {t("card.critical")}</span> : null}
                            <ScorePill value={x.total} critical={x.critical} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="muted">{t("common.none")}</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
