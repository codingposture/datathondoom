"use client";

import { use, useEffect, useState } from "react";
import { ChecklistEditor } from "@/components/ChecklistEditor";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { ChecklistDef } from "@/lib/types";

type Source = ChecklistDef & { versions: { id: string; version: number; isActive: boolean }[] };

export default function ChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const [data, setData] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    api<Source>(`/api/checklists/${id}`).then(setData).catch((e) => setError(e.message));
  }, [id]);
  if (error) return <div className="card empty">{t("common.error")}: {error}</div>;
  if (!data) return <div className="card empty"><Spinner /> {t("common.loading")}</div>;
  return <ChecklistEditor key={data.id} source={data} />;
}
