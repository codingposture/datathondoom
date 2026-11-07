"use client";

import { useI18n } from "@/lib/i18n/I18nProvider";

export function ScoreRing({ value, was, critical }: { value: number; was?: number | null; critical?: boolean }) {
  const { num } = useI18n();
  const size = 140;
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const color = critical ? "var(--danger)" : value >= 85 ? "var(--green)" : value >= 60 ? "var(--olive)" : "var(--danger)";
  return (
    <div className="ring" role="img" aria-label={`${num(value)} / 100`}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="ring__label">
        {was !== undefined && was !== null && was !== value ? <span className="ring__was">{num(was)}</span> : null}
        <span className="ring__value">{num(value)}</span>
        <span className="ring__max">/ 100</span>
      </div>
    </div>
  );
}
