"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { formatDuration } from "@/lib/time";
import type { ChecklistDef, ConversationDto, CriterionResultDto, EvaluationDto, MessageDto } from "@/lib/types";
import { AppealModal } from "./AppealModal";
import { buildSegments, ConversationPlayer, type PlayerHandle } from "./ConversationPlayer";
import { IconBack } from "./Icons";
import { QualityPanel } from "./QualityPanel";
import { useToast } from "./Toast";
import { Transcript } from "./Transcript";
import { Spinner } from "./ui";

type Data = {
  conversation: ConversationDto & { playerUrl: string | null };
  messages: MessageDto[];
  evaluation: EvaluationDto | null;
};

export function ConversationView({ id, embedded = false }: { id: string; embedded?: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checklists, setChecklists] = useState<ChecklistDef[]>([]);
  const [checklistId, setChecklistId] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<{ from: number; to: number } | null>(null);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const [appealFor, setAppealFor] = useState<string | null | undefined>(undefined);
  const player = useRef<PlayerHandle>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<Data>(`/api/conversations/${encodeURIComponent(id)}`);
      setData(d);
      setError(null);
      return d;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [id]);

  useEffect(() => {
    load().then((d) => {
      // Deep links: #msg-12 jumps to a message, ?criterion=C3 opens a criterion.
      if (!d) return;
      const m = /^#msg-(\d+)$/.exec(window.location.hash);
      if (m) setActiveIdx(Number(m[1]));
      const code = new URLSearchParams(window.location.search).get("criterion");
      const r = code && d.evaluation?.results.find((x) => x.code === code);
      if (r) setSelectedId(r.id);
    });
    api<ChecklistDef[]>("/api/checklists")
      .then((cl) => {
        setChecklists(cl);
        setChecklistId((cl.find((c) => c.isActive) ?? cl[0])?.id ?? "");
      })
      .catch(() => {});
  }, [load]);

  const segments = useMemo(() => (data ? buildSegments(data.messages) : []), [data]);
  const hasAudio = Boolean(data?.conversation.audioUrl);

  /** Scrolls the transcript to a message; for calls also highlights and plays it in the recording. */
  const jumpTo = useCallback(
    (idx: number, range?: { from: number; to: number } | null) => {
      if (!data) return;
      setActiveIdx(idx);
      history.replaceState(null, "", `#msg-${idx}`);
      if (!hasAudio) return;
      const inRange = (m: MessageDto) => (range ? m.idx >= range.from && m.idx <= range.to : m.idx === idx);
      // Use the recorded messages of the target (a message that was not recorded has no audio position).
      const recorded = data.messages.filter((m) => inRange(m) && m.audioStart !== null && m.audioEnd !== null);
      if (!recorded.length) {
        setHighlight(null);
        return;
      }
      const from = Math.min(...recorded.map((m) => m.audioStart as number));
      const to = Math.max(...recorded.map((m) => m.audioEnd as number));
      setHighlight({ from, to: Math.max(to, from + 0.8) });
      player.current?.seek(from, true);
    },
    [data, hasAudio],
  );

  const goToFragment = (r: CriterionResultDto | undefined) => {
    if (!r) return;
    setSelectedId(r.id);
    const idx = r.evidenceIdx[0] ?? r.checkedFrom;
    if (idx === null || idx === undefined) return;
    jumpTo(idx, r.evidenceIdx.length ? null : r.checkedFrom !== null && r.checkedTo !== null ? { from: r.checkedFrom, to: r.checkedTo } : null);
  };

  // Highlights the message being spoken while the recording plays (latest utterance that has started).
  const onTime = (sec: number) => {
    let current: number | null = null;
    for (const s of segments) {
      if (s.start > sec) break;
      if (sec <= s.end + 1.5) current = s.idx; // keep the last utterance marked through short pauses
    }
    setPlayingIdx(current);
  };

  const evaluate = async () => {
    setBusy(true);
    try {
      await api("/api/evaluations", { method: "POST", json: { conversationId: id, checklistId: checklistId || undefined } });
      await load();
      setSelectedId(null);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="card empty">{t("common.error")}: {error}</div>;
  if (!data) return <div className="card empty"><Spinner /> {t("common.loading")}</div>;

  const { conversation: c, messages, evaluation } = data;
  const selected = evaluation?.results.find((r) => r.id === selectedId) ?? null;
  const evidence = selected ? selected.evidenceIdx : [];
  const range = selected && selected.checkedFrom !== null && selected.checkedTo !== null ? { from: selected.checkedFrom, to: selected.checkedTo } : null;
  const isCall = c.channel === "voice call";

  return (
    <>
      <div className="page-head">
        <div>
          {!embedded ? (
            <Link href="/dialogs" className="crumb"><IconBack className="" /> {t("nav.dialogs")}</Link>
          ) : null}
          <h1>{t("card.title")}</h1>
          <div className="page-head__meta">
            <span>{isCall ? t("card.call") : t("card.chat")} {c.id}</span>·<span>{t(`lang.${c.language}`)}</span>·<span>{formatDuration(hasAudio ? Math.max(0, ...messages.map((m) => m.audioEnd ?? 0)) : c.durationSec)}</span>
            <span className="badge">{c.groupId}</span>
          </div>
        </div>
        <div className="row">
          <select className="select" value={checklistId} onChange={(e) => setChecklistId(e.target.value)} aria-label={t("dialogs.checklist")}>
            {checklists.map((cl) => (
              <option key={cl.id} value={cl.id}>
                {cl.name} v{cl.version}{cl.isActive ? " ★" : ""}
              </option>
            ))}
          </select>
          <button className="btn btn--green" onClick={evaluate} disabled={busy}>
            {busy ? <Spinner /> : null}
            {evaluation ? t("card.reevaluate") : t("card.evaluate")}
          </button>
        </div>
      </div>

      {/* The audio panel exists only for dialogs that come with a recording (audio_url). */}
      {c.audioUrl ? (
        <ConversationPlayer
          ref={player}
          messages={messages}
          audioSrc={c.audioUrl}
          playerUrl={c.playerUrl}
          highlight={highlight}
          onTime={onTime}
        />
      ) : null}

      <div className="grid-analysis" style={c.audioUrl ? undefined : { marginTop: 0 }}>
        <div className="card">
          <div className="card__head">
            <h2>{t("card.transcript")}</h2>
            <span className="faint small">{messages.length}</span>
          </div>
          <Transcript
            messages={messages}
            activeIdx={activeIdx}
            evidence={evidence}
            range={range}
            playingIdx={playingIdx}
            onSelect={(m) => jumpTo(m.idx)}
            audioMode={hasAudio}
          />
        </div>

        {evaluation ? (
          <QualityPanel
            evaluation={evaluation}
            messages={messages}
            selectedId={selectedId}
            onSelect={(rid) => {
              setSelectedId(rid === selectedId ? null : rid);
              const r = evaluation.results.find((x) => x.id === rid);
              if (r && rid !== selectedId) goToFragment(r);
            }}
            onJump={(idx) => jumpTo(idx)}
            onGoToFragment={goToFragment}
            onDispute={(r) => setAppealFor(r?.id ?? null)}
          />
        ) : (
          <div className="card">
            <div className="card__head"><h2>{t("card.quality")}</h2></div>
            <div className="card__body">
              <div className="alert alert--info">{t("card.notEvaluated")}</div>
            </div>
          </div>
        )}
      </div>

      {evaluation && appealFor !== undefined ? (
        <AppealModal
          evaluation={evaluation}
          initialResultId={appealFor}
          onClose={() => setAppealFor(undefined)}
          onSaved={() => {
            setAppealFor(undefined);
            load();
          }}
        />
      ) : null}
    </>
  );
}
