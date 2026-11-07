"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { ScorePill, Spinner } from "@/components/ui";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { formatDuration } from "@/lib/time";
import type { ChecklistDef } from "@/lib/types";

type Row = {
  id: string;
  groupId: string;
  channel: string;
  language: string;
  durationSec: number;
  messageCount: number;
  hasAudio: boolean;
  evaluation: null | {
    id: string;
    originalTotal: number;
    finalTotal: number;
    hasCriticalError: boolean;
    checklist: string;
    openAppeals: number;
    decidedAppeals: number;
  };
};

const FILTER_KEY = "cqa.dialogs.filters";

export default function DialogsPage() {
  const { t, num } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [groups, setGroups] = useState<{ groupId: string; count: number }[]>([]);
  const [filters, setFilters] = useState({ groupId: "", channel: "", language: "", evaluated: "", q: "" });
  const [checklists, setChecklists] = useState<ChecklistDef[]>([]);
  const [checklistId, setChecklistId] = useState("");
  const [groupInput, setGroupInput] = useState("DEV");
  const [busy, setBusy] = useState<"" | "import" | "upload" | "eval">("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const f = sessionStorage.getItem(FILTER_KEY);
      if (f) setFilters((x) => ({ ...x, ...JSON.parse(f) }));
    } catch {
      /* ignore */
    }
    api<ChecklistDef[]>("/api/checklists")
      .then((cl) => {
        setChecklists(cl);
        setChecklistId((cl.find((c) => c.isActive) ?? cl[0])?.id ?? "");
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    try {
      const r = await api<{ items: Row[]; groups: { groupId: string; count: number }[] }>(`/api/conversations?${qs}`);
      setRows(r.items);
      setGroups(r.groups);
    } catch (e) {
      toast((e as Error).message, "error");
      setRows([]);
    }
  }, [filters, toast]);

  useEffect(() => {
    load();
    try {
      sessionStorage.setItem(FILTER_KEY, JSON.stringify(filters));
    } catch {
      /* ignore */
    }
  }, [load, filters]);

  const setF = (k: keyof typeof filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  const doImport = async () => {
    setBusy("import");
    try {
      const r = await api<{ total: number; created: number; updated: number }>("/api/datasets/import", { method: "POST", json: { groupId: groupInput.trim() } });
      toast(t("dialogs.imported", r));
      setFilters((f) => ({ ...f, groupId: groupInput.trim() }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy("");
    }
  };

  const doUpload = async (file: File) => {
    setBusy("upload");
    try {
      const data = JSON.parse(await file.text());
      const r = await api<{ total: number }>("/api/conversations/upload", { method: "POST", json: { groupId: "UPLOAD", data } });
      toast(t("dialogs.uploaded", r));
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const doEvaluate = async (ids: string[]) => {
    if (!ids.length) return;
    setBusy("eval");
    try {
      const r = await api<{ evaluated: number; failed: number }>("/api/evaluations/batch", { method: "POST", json: { checklistId, conversationIds: ids } });
      toast(t("dialogs.evaluated", { n: r.evaluated, f: r.failed }));
      setSelected(new Set());
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy("");
    }
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const all = rows ?? [];
  const allSelected = all.length > 0 && all.every((r) => selected.has(r.id));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("dialogs.title")}</h1>
          <div className="page-head__sub">{t("dialogs.subtitle")}</div>
        </div>
        <div className="row">
          <input className="input" style={{ width: 120 }} value={groupInput} onChange={(e) => setGroupInput(e.target.value)} aria-label="group_id" placeholder="group_id" />
          <button className="btn btn--primary" onClick={doImport} disabled={!groupInput.trim() || busy !== ""}>
            {busy === "import" ? <Spinner /> : null}
            {busy === "import" ? t("dialogs.importing") : t("dialogs.import")}
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy !== ""}>
            {busy === "upload" ? <Spinner /> : null}
            {t("dialogs.upload")}
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && doUpload(e.target.files[0])} />
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <select className="select" value={filters.groupId} onChange={(e) => setF("groupId", e.target.value)} aria-label={t("dialogs.group")}>
            <option value="">{t("dialogs.group")}: {t("common.all")}</option>
            {groups.map((g) => (
              <option key={g.groupId} value={g.groupId}>{g.groupId} ({g.count})</option>
            ))}
          </select>
          <select className="select" value={filters.channel} onChange={(e) => setF("channel", e.target.value)} aria-label={t("dialogs.channel")}>
            <option value="">{t("dialogs.channel")}: {t("common.all")}</option>
            <option value="agent chat">{t("channel.agent chat")}</option>
            <option value="voice call">{t("channel.voice call")}</option>
          </select>
          <select className="select" value={filters.language} onChange={(e) => setF("language", e.target.value)} aria-label={t("dialogs.language")}>
            <option value="">{t("dialogs.language")}: {t("common.all")}</option>
            <option value="RU">RU</option>
            <option value="KZ">KZ</option>
            <option value="EN">EN</option>
          </select>
          <select className="select" value={filters.evaluated} onChange={(e) => setF("evaluated", e.target.value)} aria-label={t("dialogs.status")}>
            <option value="">{t("dialogs.status")}: {t("common.all")}</option>
            <option value="yes">{t("dialogs.status.yes")}</option>
            <option value="no">{t("dialogs.status.no")}</option>
            <option value="critical">{t("dialogs.status.critical")}</option>
          </select>
          <input className="input" placeholder={t("common.search")} value={filters.q} onChange={(e) => setF("q", e.target.value)} style={{ width: 160 }} />
          <span className="spacer" />
          <select className="select" value={checklistId} onChange={(e) => setChecklistId(e.target.value)} aria-label={t("dialogs.checklist")}>
            {checklists.map((c) => (
              <option key={c.id} value={c.id}>{c.name} v{c.version}{c.isActive ? " ★" : ""}</option>
            ))}
          </select>
          {selected.size ? (
            <button className="btn btn--green" disabled={busy !== ""} onClick={() => doEvaluate([...selected])}>
              {busy === "eval" ? <Spinner /> : null}
              {t("dialogs.evaluateSelected", { n: selected.size })}
            </button>
          ) : (
            <button className="btn btn--green" disabled={busy !== "" || !all.length} onClick={() => doEvaluate(all.map((r) => r.id))}>
              {busy === "eval" ? <Spinner /> : null}
              {busy === "eval" ? t("dialogs.evaluating") : t("dialogs.evaluateAll")}
            </button>
          )}
        </div>

        {rows === null ? (
          <div className="empty"><Spinner /> {t("common.loading")}</div>
        ) : rows.length === 0 ? (
          <div className="empty">{t("dialogs.empty")}</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(all.map((r) => r.id)))} aria-label="select all" />
                  </th>
                  <th>{t("dialogs.col.id")}</th>
                  <th>{t("dialogs.channel")}</th>
                  <th>{t("dialogs.language")}</th>
                  <th className="num">{t("dialogs.col.duration")}</th>
                  <th className="num">{t("dialogs.col.messages")}</th>
                  <th className="num">{t("dialogs.col.score")}</th>
                  <th>{t("dialogs.checklist")}</th>
                  <th>{t("dialogs.col.appeals")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => router.push(`/dialogs/${encodeURIComponent(r.id)}`)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={r.id} />
                    </td>
                    <td>
                      <span className="mono" style={{ fontWeight: 600 }}>{r.id}</span> <span className="badge" style={{ marginLeft: 4 }}>{r.groupId}</span>
                    </td>
                    <td>
                      {r.channel === "voice call" ? <span className="badge badge--info">☎ {t("channel.voice call")}</span> : <span className="badge">{t("channel.agent chat")}</span>}
                    </td>
                    <td>{r.language}</td>
                    <td className="num">{formatDuration(r.durationSec)}</td>
                    <td className="num">{r.messageCount}</td>
                    <td className="num">
                      {r.evaluation ? (
                        <span className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                          {r.evaluation.hasCriticalError ? <span className="badge badge--danger" title={t("card.critical")}>⚠</span> : null}
                          {r.evaluation.finalTotal !== r.evaluation.originalTotal ? <s className="faint small">{num(r.evaluation.originalTotal)}</s> : null}
                          <ScorePill value={r.evaluation.finalTotal} critical={r.evaluation.hasCriticalError} />
                        </span>
                      ) : (
                        <span className="faint small">{t("dialogs.notEvaluated")}</span>
                      )}
                    </td>
                    <td className="small muted">{r.evaluation?.checklist ?? "—"}</td>
                    <td>
                      {r.evaluation?.openAppeals ? <span className="badge badge--warn">{r.evaluation.openAppeals} {t("appeals.status.OPEN").toLowerCase()}</span> : null}
                      {r.evaluation?.decidedAppeals ? <span className="badge badge--green" style={{ marginLeft: 4 }}>{r.evaluation.decidedAppeals} ✓</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows?.length ? <div className="small faint" style={{ padding: "10px 16px" }}>{t("dialogs.count", { n: rows.length })}</div> : null}
      </div>
    </>
  );
}
