"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useToast } from "./Toast";
import { Modal, Spinner } from "./ui";

type Preview = {
  fileName: string;
  data: unknown;
  groupId: string | null;
  total: number;
  withAudio: number;
  chats: number;
  calls: number;
  samples: { id: string; channel: string; language: string; audio: boolean }[];
};

type RawRecord = { conversation_id?: unknown; channel?: unknown; language?: unknown; audio_url?: unknown };

/** Client-side preview of an organizer-format JSON file (envelope, array of records, or one record). */
function preview(fileName: string, data: unknown): Preview {
  let groupId: string | null = null;
  let records: RawRecord[];
  if (data && typeof data === "object" && !Array.isArray(data) && "data" in data) {
    const env = (data as { data?: { dataset_group_id?: string; records?: RawRecord[] } }).data;
    groupId = env?.dataset_group_id ?? null;
    records = env?.records ?? [];
  } else if (Array.isArray(data)) records = data as RawRecord[];
  else records = [data as RawRecord];
  const hasAudio = (r: RawRecord) => typeof r.audio_url === "string" && r.audio_url.trim() !== "";
  return {
    fileName,
    data,
    groupId,
    total: records.length,
    withAudio: records.filter(hasAudio).length,
    chats: records.filter((r) => r.channel !== "voice call").length,
    calls: records.filter((r) => r.channel === "voice call").length,
    samples: records.slice(0, 6).map((r) => ({ id: String(r.conversation_id ?? "?"), channel: String(r.channel ?? ""), language: String(r.language ?? ""), audio: hasAudio(r) })),
  };
}

export function UploadDialogsModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: (groupId: string) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [p, setP] = useState<Preview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [group, setGroup] = useState("");
  const [busy, setBusy] = useState(false);

  const pick = async (file: File) => {
    setParseError(null);
    setP(null);
    try {
      const pr = preview(file.name, JSON.parse(await file.text()));
      setP(pr);
      setGroup(pr.groupId ?? "UPLOAD");
    } catch (e) {
      setParseError(`${t("upload.invalid")}: ${(e as Error).message}`);
    }
  };

  const upload = async () => {
    if (!p) return;
    setBusy(true);
    try {
      const r = await api<{ groupId: string; total: number; created: number; updated: number; withAudio: number }>("/api/conversations/upload", {
        method: "POST",
        json: { groupId: group.trim() || undefined, data: p.data },
      });
      toast(t("upload.done", { total: r.total, created: r.created, updated: r.updated, audio: r.withAudio, group: r.groupId }));
      onUploaded(r.groupId);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t("upload.title")}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn btn--primary" disabled={!p || !p.total || busy} onClick={upload}>
            {busy ? <Spinner /> : null}
            {t("upload.submit")}
          </button>
        </>
      }
    >
      <div className="muted small">{t("upload.hint")}</div>
      <pre className="mono small" style={{ margin: 0, padding: "10px 12px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, whiteSpace: "pre-wrap" }}>
{`{ "isSuccess": true, "data": { "dataset_group_id": "DEV",
  "records": [{ "conversation_id": "p4-ru-001",
    "channel": "voice call", "language": "RU",
    "transcript": [{ "timestamp": "…", "speaker": "operator", "text": "…" }],
    "audio_url": "https://…" }] } }`}
      </pre>
      <div className="row">
        <button className="btn" onClick={() => fileRef.current?.click()}>{t("upload.choose")}</button>
        <span className="small muted">{p?.fileName ?? t("upload.noFile")}</span>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pick(f);
            e.target.value = "";
          }}
        />
      </div>
      {parseError ? <div className="alert alert--danger small">{parseError}</div> : null}
      {p ? (
        <>
          <div className="alert alert--olive small" style={{ flexDirection: "column", gap: 4 }}>
            <div>{t("upload.summary", { total: p.total, chats: p.chats, calls: p.calls })}</div>
            <div>{t("upload.withAudio", { n: p.withAudio })}</div>
            {p.samples.length ? (
              <div className="row" style={{ gap: 6, marginTop: 4 }}>
                {p.samples.map((s) => (
                  <span key={s.id} className={`badge ${s.audio ? "badge--info" : ""}`}>
                    {s.id} · {s.language}{s.audio ? " · ♪" : ""}
                  </span>
                ))}
                {p.total > p.samples.length ? <span className="faint small">+{p.total - p.samples.length}</span> : null}
              </div>
            ) : null}
          </div>
          <label className="field">
            <span>{t("upload.group")}</span>
            <input className="input" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="UPLOAD" />
          </label>
        </>
      ) : null}
    </Modal>
  );
}
