"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { formatDuration } from "@/lib/time";
import type { MessageDto } from "@/lib/types";

type Props = {
  messages: MessageDto[];
  activeIdx: number | null;
  evidence: number[];
  range: { from: number; to: number } | null;
  playingIdx: number | null;
  onSelect?: (m: MessageDto) => void;
  maxHeight?: number;
  /** Calls with a recording: show the position in the audio instead of the transcript clock. */
  audioMode?: boolean;
};

/** Displays the transcript; each message has a stable DOM anchor `msg-{idx}`. */
export function Transcript({ messages, activeIdx, evidence, range, playingIdx, onSelect, maxHeight, audioMode = false }: Props) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);

  const scrollTo = (idx: number, onlyIfHidden: boolean) => {
    const b = box.current;
    const el = b?.querySelector<HTMLElement>(`#msg-${idx}`);
    if (!b || !el) return;
    const top = el.offsetTop - b.offsetTop;
    const visible = top >= b.scrollTop && top + el.offsetHeight <= b.scrollTop + b.clientHeight;
    if (onlyIfHidden && visible) return;
    b.scrollTo({ top: top - b.clientHeight / 3, behavior: "smooth" });
  };

  useEffect(() => {
    if (activeIdx !== null) scrollTo(activeIdx, false);
  }, [activeIdx]);

  // Follow along while the recording plays.
  useEffect(() => {
    if (playingIdx !== null) scrollTo(playingIdx, true);
  }, [playingIdx]);

  const ev = new Set(evidence);
  return (
    <div className="transcript" ref={box} style={maxHeight ? { maxHeight } : undefined}>
      {messages.map((m) => {
        const inRange = range && m.idx >= range.from && m.idx <= range.to;
        const notRecorded = audioMode && m.audioStart === null;
        const cls = [
          "msg",
          `msg--${m.speaker}`,
          onSelect ? "msg--clickable" : "",
          inRange ? "msg--range" : "",
          ev.has(m.idx) ? "msg--evidence" : "",
          activeIdx === m.idx ? "msg--active" : "",
          playingIdx === m.idx ? "msg--playing" : "",
          notRecorded ? "msg--unrecorded" : "",
        ].join(" ");
        const clock = m.timestamp.includes("T") ? formatDuration(m.offsetSec) : m.timestamp;
        const shown = audioMode ? (m.audioStart !== null ? formatDuration(m.audioStart) : "—") : clock;
        const title = audioMode
          ? `${t("card.inRecording")}: ${m.audioStart !== null ? formatDuration(m.audioStart) : t("card.notRecorded")} · ${m.timestamp}`
          : m.timestamp;
        return (
          <div key={m.idx} id={`msg-${m.idx}`} className={cls} onClick={() => onSelect?.(m)} title={title}>
            <div className="msg__head">
              <span className="msg__time">{shown}</span>
              <span className="msg__who">{t(`speaker.${m.speaker}`)}</span>
              {notRecorded && m.speaker !== "system" ? <span className="badge" style={{ fontSize: 10.5, padding: "0 6px" }}>{t("card.notRecorded")}</span> : null}
              <span className="msg__idx">#{m.idx}</span>
            </div>
            <div className="msg__text">{m.text}</div>
          </div>
        );
      })}
    </div>
  );
}
