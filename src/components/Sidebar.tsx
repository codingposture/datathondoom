"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { Lang } from "@/lib/types";
import { IconAnalytics, IconAppeal, IconChecklist, IconDialogs, IconFreedom } from "./Icons";

const LANGS: Lang[] = ["RU", "KZ", "EN"];

export function Sidebar() {
  const { t, lang, setLang } = useI18n();
  const path = usePathname();
  const [openAppeals, setOpenAppeals] = useState(0);

  useEffect(() => {
    let alive = true;
    api<{ counts: Record<string, number> }>("/api/appeals?status=open")
      .then((r) => alive && setOpenAppeals(r.counts.OPEN ?? 0))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [path]);

  const items = [
    { href: "/dialogs", label: t("nav.dialogs"), icon: IconDialogs },
    { href: "/checklists", label: t("nav.checklists"), icon: IconChecklist },
    { href: "/appeals", label: t("nav.appeals"), icon: IconAppeal, badge: openAppeals },
    { href: "/analytics", label: t("nav.analytics"), icon: IconAnalytics },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__logo">CQA</span>
        <span className="sidebar__sub">{t("app.title")}</span>
      </div>
      <nav className="sidebar__nav">
        {items.map((it) => {
          const active = path === it.href || path.startsWith(it.href + "/");
          const Icon = it.icon;
          return (
            <Link key={it.href} href={it.href} className={`sidebar__item ${active ? "sidebar__item--active" : ""}`} aria-current={active ? "page" : undefined} title={it.label}>
              <Icon />
              <span className="label">{it.label}</span>
              {it.badge ? <span className="sidebar__badge">{it.badge}</span> : null}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar__footer">
        <div className="sidebar__label">{t("nav.language")}</div>
        <div className="lang-switch" role="group" aria-label={t("nav.language")}>
          {LANGS.map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>
              {l === "KZ" ? "ҚАЗ" : l}
            </button>
          ))}
        </div>
        <div className="sidebar__freedom">
          <IconFreedom className="sidebar__freedom-logo" />
          FREEDOM
        </div>
      </div>
    </aside>
  );
}
