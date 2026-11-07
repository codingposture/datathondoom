"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { ChecklistDef, CriterionHints, Detector, Lang } from "@/lib/types";
import { IconDown, IconTrash, IconUp } from "./Icons";
import { useToast } from "./Toast";
import { Spinner } from "./ui";

type EditCriterion = {
  _k: string;
  code: string;
  title: string;
  description: string;
  sectionKey: string | null;
  answerType: "BINARY" | "SCALE";
  scaleMin: number;
  scaleMax: number;
  weight: number;
  naAllowed: boolean;
  naRule: string;
  isCritical: boolean;
  hints: CriterionHints;
};

type EditState = {
  name: string;
  decimals: number;
  roundingMode: ChecklistDef["roundingMode"];
  criticalPolicy: ChecklistDef["criticalPolicy"];
  sections: { key: string; name: string }[];
  criteria: EditCriterion[];
};

const DETECTORS: Detector[] = ["keywords", "keywords_absent", "greeting", "need", "consultation", "security", "politeness", "wait", "escalation", "closing"];
const LANGS: Lang[] = ["RU", "KZ", "EN"];
let seq = 0;
const key = () => `k${Date.now().toString(36)}${(seq++).toString(36)}`;

function fromDef(d: ChecklistDef): EditState {
  return {
    name: d.name,
    decimals: d.decimals,
    roundingMode: d.roundingMode,
    criticalPolicy: d.criticalPolicy,
    sections: d.sections.map((s) => ({ key: s.key, name: s.name })),
    criteria: d.criteria.map((c) => ({
      _k: key(),
      code: c.code,
      title: c.title,
      description: c.description,
      sectionKey: c.sectionKey,
      answerType: c.answerType,
      scaleMin: c.scaleMin,
      scaleMax: c.scaleMax,
      weight: c.weight,
      naAllowed: c.naAllowed,
      naRule: c.naRule,
      isCritical: c.isCritical,
      hints: c.hints ?? {},
    })),
  };
}

export const EMPTY_CHECKLIST: EditState = {
  name: "",
  decimals: 1,
  roundingMode: "half-up",
  criticalPolicy: "flag",
  sections: [{ key: "main", name: "Основное" }],
  criteria: [],
};

function newCriterion(n: number, sectionKey: string | null): EditCriterion {
  return {
    _k: key(),
    code: `C${n}`,
    title: "",
    description: "",
    sectionKey,
    answerType: "BINARY",
    scaleMin: 0,
    scaleMax: 1,
    weight: 10,
    naAllowed: false,
    naRule: "",
    isCritical: false,
    hints: { detector: "keywords", keywords: {} },
  };
}

export function ChecklistEditor({ source }: { source: (ChecklistDef & { versions?: { id: string; version: number; isActive: boolean }[] }) | null }) {
  const { t, num } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const initial = useMemo(() => (source ? fromDef(source) : { ...EMPTY_CHECKLIST, criteria: [newCriterion(1, "main")] }), [source]);
  const [s, setS] = useState<EditState>(initial);
  const [saving, setSaving] = useState(false);
  const [applyGroup, setApplyGroup] = useState("DEV");
  const [applying, setApplying] = useState(false);
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);

  useEffect(() => setS(initial), [initial]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const weightSum = s.criteria.reduce((a, c) => a + (Number(c.weight) || 0), 0);
  const upd = (k: string, patch: Partial<EditCriterion>) => setS((x) => ({ ...x, criteria: x.criteria.map((c) => (c._k === k ? { ...c, ...patch } : c)) }));
  const move = (i: number, d: -1 | 1) =>
    setS((x) => {
      const arr = [...x.criteria];
      const j = i + d;
      if (j < 0 || j >= arr.length) return x;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...x, criteria: arr };
    });

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...s, criteria: s.criteria.map(({ _k, ...c }) => c) };
      const r = source
        ? await api<ChecklistDef>(`/api/checklists/${source.id}`, { method: "PUT", json: payload })
        : await api<ChecklistDef>("/api/checklists", { method: "POST", json: payload });
      toast(t("checklists.saved", { v: r.version }));
      router.push(`/checklists/${r.id}`);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const apply = async () => {
    if (!source) return;
    setApplying(true);
    try {
      const r = await api<{ evaluated: number; failed: number }>("/api/evaluations/batch", { method: "POST", json: { checklistId: source.id, groupId: applyGroup.trim() || undefined } });
      toast(t("checklists.applied", { n: r.evaluated }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setApplying(false);
    }
  };

  const sectionKeys = new Set(s.sections.map((x) => x.key));

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <Link href="/checklists" className="crumb">← {t("nav.checklists")}</Link>
          <h1>{source ? `${source.name} · v${source.version}` : t("checklists.new")}</h1>
          {source?.versions?.length ? (
            <div className="page-head__meta">
              {t("checklists.versions")}:
              {source.versions.map((v) => (
                <Link key={v.id} href={`/checklists/${v.id}`} className={`badge ${v.id === source.id ? "badge--olive" : ""}`}>
                  v{v.version}{v.isActive ? " ★" : ""}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <div className="row">
          {dirty ? <span className="badge badge--warn">{t("checklists.unsaved")}</span> : null}
          <button className="btn btn--primary" onClick={save} disabled={saving || !s.name.trim() || !s.criteria.length}>
            {saving ? <Spinner /> : null}
            {t("checklists.saveVersion")}
          </button>
        </div>
      </div>

      <div className="grid-2">
        <div className="card card--pad stack">
          <label className="field">
            <span>{t("checklists.name")}</span>
            <input className="input" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
          </label>
          <h3>{t("checklists.settings")}</h3>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field">
              <span>{t("checklists.decimals")}</span>
              <input className="input" type="number" min={0} max={4} style={{ width: 90 }} value={s.decimals} onChange={(e) => setS({ ...s, decimals: Number(e.target.value) })} />
            </label>
            <label className="field">
              <span>{t("checklists.rounding")}</span>
              <select className="select" value={s.roundingMode} onChange={(e) => setS({ ...s, roundingMode: e.target.value as EditState["roundingMode"] })}>
                {(["half-up", "floor", "ceil"] as const).map((m) => <option key={m} value={m}>{t(`checklists.rounding.${m}`)}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{t("checklists.criticalPolicy")}</span>
              <select className="select" value={s.criticalPolicy} onChange={(e) => setS({ ...s, criticalPolicy: e.target.value as EditState["criticalPolicy"] })}>
                {(["flag", "zero-total"] as const).map((m) => <option key={m} value={m}>{t(`checklists.criticalPolicy.${m}`)}</option>)}
              </select>
            </label>
          </div>
          <div className="weight-meter">
            <span className="small">{t("checklists.weightSum", { n: num(weightSum) })}</span>
            <div className="bar"><i style={{ width: `${Math.min(100, weightSum)}%`, background: weightSum === 100 ? "var(--green)" : "var(--olive)" }} /></div>
          </div>
          {weightSum !== 100 ? <div className="alert alert--olive small">{t("checklists.weightWarn")}</div> : null}
        </div>

        <div className="card card--pad stack">
          <h3>{t("checklists.sections")}</h3>
          {s.sections.map((sec, i) => (
            <div key={i} className="row">
              <input className="input mono" style={{ width: 110 }} value={sec.key} onChange={(e) => setS({ ...s, sections: s.sections.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)), criteria: s.criteria.map((c) => (c.sectionKey === sec.key ? { ...c, sectionKey: e.target.value } : c)) })} aria-label="key" />
              <input className="input" style={{ flex: 1 }} value={sec.name} onChange={(e) => setS({ ...s, sections: s.sections.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder={t("checklists.sectionName")} />
              <button className="btn btn--icon btn--ghost" title={t("common.delete")} onClick={() => setS({ ...s, sections: s.sections.filter((_, j) => j !== i), criteria: s.criteria.map((c) => (c.sectionKey === sec.key ? { ...c, sectionKey: null } : c)) })}>
                <IconTrash />
              </button>
            </div>
          ))}
          <div>
            <button className="btn btn--sm" onClick={() => setS({ ...s, sections: [...s.sections, { key: `s${s.sections.length + 1}`, name: "" }] })}>+ {t("checklists.addSection")}</button>
          </div>
          {source ? (
            <>
              <hr className="divider" />
              <h3>{t("checklists.apply")}</h3>
              <div className="row">
                <input className="input" style={{ width: 140 }} value={applyGroup} onChange={(e) => setApplyGroup(e.target.value)} placeholder="group_id" aria-label={t("checklists.applyPrompt")} />
                <button className="btn btn--green" onClick={apply} disabled={applying || dirty}>
                  {applying ? <Spinner /> : null}
                  {t("checklists.apply")} v{source.version}
                </button>
              </div>
              {dirty ? <div className="small faint">{t("checklists.unsaved")}</div> : null}
            </>
          ) : null}
        </div>
      </div>

      {s.criteria.map((c, i) => {
        const detector = c.hints.detector ?? "keywords";
        const usesKeywords = detector === "keywords" || detector === "keywords_absent";
        return (
          <div key={c._k} className={`crit-editor ${c.isCritical ? "crit-editor--critical" : ""}`}>
            <div className="crit-editor__grid">
              <label className="field">
                <span>{t("checklists.code")}</span>
                <input className="input mono" value={c.code} onChange={(e) => upd(c._k, { code: e.target.value })} />
              </label>
              <label className="field">
                <span>{t("checklists.criterionTitle")}</span>
                <input className="input" value={c.title} onChange={(e) => upd(c._k, { title: e.target.value })} />
              </label>
              <label className="field">
                <span>{t("checklists.section")}</span>
                <select className="select" value={c.sectionKey && sectionKeys.has(c.sectionKey) ? c.sectionKey : ""} onChange={(e) => upd(c._k, { sectionKey: e.target.value || null })}>
                  <option value="">{t("checklists.noSection")}</option>
                  {s.sections.map((x) => <option key={x.key} value={x.key}>{x.name || x.key}</option>)}
                </select>
              </label>
              <label className="field">
                <span>{t("common.weight")}</span>
                <input className="input" type="number" min={0} step="any" value={c.weight} onChange={(e) => upd(c._k, { weight: Number(e.target.value) })} />
              </label>
            </div>
            <label className="field">
              <span>{t("checklists.description")}</span>
              <input className="input" value={c.description} onChange={(e) => upd(c._k, { description: e.target.value })} />
            </label>
            <div className="crit-editor__grid2">
              <label className="field">
                <span>{t("checklists.answerType")}</span>
                <select className="select" value={c.answerType} onChange={(e) => upd(c._k, e.target.value === "SCALE" ? { answerType: "SCALE", scaleMin: 0, scaleMax: Math.max(2, c.scaleMax) } : { answerType: "BINARY", scaleMin: 0, scaleMax: 1 })}>
                  <option value="BINARY">{t("checklists.type.BINARY")}</option>
                  <option value="SCALE">{t("checklists.type.SCALE")}</option>
                </select>
              </label>
              <div className="field">
                <span>{t("checklists.scale")}</span>
                {c.answerType === "SCALE" ? (
                  <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <input className="input" type="number" style={{ width: 64 }} value={c.scaleMin} onChange={(e) => upd(c._k, { scaleMin: Number(e.target.value) })} aria-label="min" />
                    –
                    <input className="input" type="number" style={{ width: 64 }} value={c.scaleMax} onChange={(e) => upd(c._k, { scaleMax: Number(e.target.value) })} aria-label="max" />
                  </div>
                ) : (
                  <span className="faint" style={{ height: 36, display: "flex", alignItems: "center" }}>0 / 1</span>
                )}
              </div>
              <div className="field">
                <span>&nbsp;</span>
                <div className="row" style={{ height: 36 }}>
                  <label className="check"><input type="checkbox" checked={c.naAllowed} onChange={(e) => upd(c._k, { naAllowed: e.target.checked })} /> {t("checklists.naAllowed")}</label>
                  <label className="check" style={{ color: c.isCritical ? "var(--danger)" : undefined }}><input type="checkbox" checked={c.isCritical} onChange={(e) => upd(c._k, { isCritical: e.target.checked })} /> {t("checklists.critical")}</label>
                </div>
              </div>
              <label className="field">
                <span>{t("checklists.detector")}</span>
                <select className="select" value={detector} onChange={(e) => upd(c._k, { hints: { ...c.hints, detector: e.target.value as Detector } })}>
                  {DETECTORS.map((d) => <option key={d} value={d}>{t(`detector.${d}`)}</option>)}
                </select>
              </label>
            </div>
            {c.naAllowed ? (
              <label className="field">
                <span>{t("checklists.naRule")}</span>
                <input className="input" value={c.naRule} onChange={(e) => upd(c._k, { naRule: e.target.value })} />
              </label>
            ) : null}
            {usesKeywords ? (
              <div className="crit-editor__grid3">
                {LANGS.map((l) => (
                  <label key={l} className="field">
                    <span>{t("checklists.keywords", { lang: l })}</span>
                    <input
                      className="input"
                      defaultValue={(c.hints.keywords?.[l] ?? []).join(", ")}
                      onBlur={(e) => upd(c._k, { hints: { ...c.hints, keywords: { ...(c.hints.keywords ?? {}), [l]: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } } })}
                    />
                  </label>
                ))}
              </div>
            ) : null}
            <div className="row">
              <span className="faint small">#{i + 1}</span>
              <span className="spacer" />
              <button className="btn btn--sm btn--ghost" onClick={() => move(i, -1)} disabled={i === 0} title={t("checklists.moveUp")}><IconUp /></button>
              <button className="btn btn--sm btn--ghost" onClick={() => move(i, 1)} disabled={i === s.criteria.length - 1} title={t("checklists.moveDown")}><IconDown /></button>
              <button className="btn btn--sm btn--danger" onClick={() => setS({ ...s, criteria: s.criteria.filter((x) => x._k !== c._k) })}><IconTrash /> {t("checklists.remove")}</button>
            </div>
          </div>
        );
      })}
      <div>
        <button
          className="btn"
          onClick={() => {
            const nums = s.criteria.map((c) => Number(/\d+/.exec(c.code)?.[0] ?? 0));
            setS({ ...s, criteria: [...s.criteria, newCriterion(Math.max(0, ...nums) + 1, s.sections[0]?.key ?? null)] });
          }}
        >
          + {t("checklists.addCriterion")}
        </button>
      </div>
    </div>
  );
}
