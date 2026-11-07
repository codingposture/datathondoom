"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { pickLocalized } from "../localized";
import type { Lang } from "../types";
import { DICTS, type DictKey } from "./dict";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: DictKey, params?: Record<string, string | number>) => string;
  /** Picks the UI language from a stored {RU, EN, KZ} JSON explanation. */
  loc: (value: string | null | undefined) => string;
  /** Formats a number with the UI locale (e.g. 85,5 in RU/KZ). */
  num: (n: number | null | undefined, decimals?: number) => string;
};

const I18nContext = createContext<Ctx | null>(null);
const LOCALES: Record<Lang, string> = { RU: "ru-RU", EN: "en-US", KZ: "kk-KZ" };
const STORAGE_KEY = "cqa.lang";

export function I18nProvider({ initial, children }: { initial: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
      if (stored && stored in DICTS && stored !== lang) setLangState(stored);
    } catch {
      /* storage unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    document.cookie = `cqa_lang=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l === "KZ" ? "kk" : l.toLowerCase();
  }, []);

  const value = useMemo<Ctx>(() => {
    const dict = DICTS[lang];
    const fmt = new Map<number, Intl.NumberFormat>();
    return {
      lang,
      setLang,
      t: (key, params) => {
        let s = dict[key] ?? DICTS.RU[key] ?? key;
        if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
        return s;
      },
      loc: (v) => pickLocalized(v, lang),
      num: (n, decimals = 1) => {
        if (n === null || n === undefined || Number.isNaN(n)) return "—";
        if (!fmt.has(decimals)) fmt.set(decimals, new Intl.NumberFormat(LOCALES[lang], { maximumFractionDigits: decimals }));
        return fmt.get(decimals)!.format(n);
      },
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
