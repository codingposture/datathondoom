// Evaluator explanations can be stored as a JSON object {RU, EN, KZ} so the UI language toggle
// can show them in any language. Plain strings (e.g. from an LLM) are returned unchanged.
import type { Lang } from "./types";

export type Localized = Record<Lang, string>;

export function encodeLocalized(l: Localized): string {
  return JSON.stringify(l);
}

export function pickLocalized(value: string | null | undefined, lang: Lang): string {
  if (!value) return "";
  if (value.startsWith("{")) {
    try {
      const o = JSON.parse(value) as Partial<Localized>;
      return o[lang] ?? o.RU ?? o.EN ?? Object.values(o)[0] ?? value;
    } catch {
      return value;
    }
  }
  return value;
}
