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
};

/** Displays the transcript; each message has a stable DOM anchor `msg-{idx}`. */
export function Transcript({ messages, activeIdx, evidence, range, playingIdx, onSelect, maxHeight }: Props) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeIdx === null || !box.current) return;
    const el = box.current.querySelector<HTMLElement>(`#msg-${activeIdx}`);
    if (el) box.current.scrollTo({ top: el.offsetTop - box.current.clientHeight / 3, behavior: "smooth" });
  }, [activeIdx]);

  const ev = new Set(evidence);
  return (
    <div className="transcript" ref={box} style={maxHeight ? { maxHeight } : undefined}>
      {messages.map((m) => {
        const inRange = range && m.idx >= range.from && m.idx <= range.to;
        const cls = [
          "msg",
          `msg--${m.speaker}`,
          onSelect ? "msg--clickable" : "",
          inRange ? "msg--range" : "",
          ev.has(m.idx) ? "msg--evidence" : "",
          activeIdx === m.idx ? "msg--active" : "",
          playingIdx === m.idx ? "msg--playing" : "",
        ].join(" ");
        const ts = m.timestamp.includes("T") ? formatDuration(m.offsetSec) : m.timestamp;
        return (
          <div key={m.idx} id={`msg-${m.idx}`} className={cls} onClick={() => onSelect?.(m)} title={m.timestamp}>
            <div className="msg__head">
              <span className="msg__time">{ts}</span>
              <span className="msg__who">{t(`speaker.${m.speaker}`)}</span>
              <span className="msg__idx">#{m.idx}</span>
            </div>
            <div className="msg__text">{m.text}</div>
          </div>
        );
      })}
    </div>
  );
}
