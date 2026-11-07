import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ToastProvider } from "@/components/Toast";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import type { Lang } from "@/lib/types";
import "./globals.css";

export const metadata: Metadata = {
  title: "CQA — Conversation Quality Analytics",
  description: "Оценка качества диалогов операторов",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const c = (await cookies()).get("cqa_lang")?.value as Lang | undefined;
  const lang: Lang = c === "EN" || c === "KZ" ? c : "RU";
  return (
    <html lang={lang === "KZ" ? "kk" : lang.toLowerCase()}>
      <body>
        <I18nProvider initial={lang}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
