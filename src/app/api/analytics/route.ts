import { handle } from "@/lib/api";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/mappers";
import { round } from "@/lib/scoring";
import type { ChecklistDef } from "@/lib/types";

const avg = (xs: number[]) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length, 1) : null);

/** Aggregates over the latest evaluation of each conversation (optionally filtered by group / checklist). */
export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const groupId = q.get("groupId") || undefined;
  const checklistId = q.get("checklistId") || undefined;

  const conversations = await prisma.conversation.findMany({
    where: groupId ? { groupId } : {},
    select: {
      id: true,
      channel: true,
      language: true,
      evaluations: {
        where: checklistId ? { checklistId } : {},
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { results: true, appeals: true },
      },
    },
  });

  const evaluated = conversations.filter((c) => c.evaluations.length);
  const latest = evaluated.map((c) => ({ c, e: c.evaluations[0] }));

  const by = (key: "language" | "channel") => {
    const m = new Map<string, number[]>();
    for (const { c, e } of latest) m.set(c[key], [...(m.get(c[key]) ?? []), e.finalTotal]);
    return [...m.entries()].map(([name, xs]) => ({ name, avg: avg(xs), count: xs.length })).sort((a, b) => a.name.localeCompare(b.name));
  };

  // Per-criterion pass / N/A rates, keyed by criterion code (stable across versions).
  const crit = new Map<string, { code: string; title: string; n: number; na: number; scoreSum: number; applicable: number }>();
  for (const { e } of latest) {
    const cl = parseJson<ChecklistDef>(e.checklistSnapshot, {} as ChecklistDef);
    for (const r of e.results) {
      const def = cl.criteria?.find((x) => x.id === r.criterionId);
      const k = r.code;
      const cur = crit.get(k) ?? { code: k, title: def?.title ?? k, n: 0, na: 0, scoreSum: 0, applicable: 0 };
      cur.n++;
      if (r.finalAnswer === "na") cur.na++;
      else if (r.finalMaxPoints > 0) {
        cur.applicable++;
        cur.scoreSum += r.finalPoints / r.finalMaxPoints;
      }
      crit.set(k, cur);
    }
  }

  const buckets = Array.from({ length: 10 }, (_, i) => ({ range: `${i * 10}–${i === 9 ? 100 : i * 10 + 9}`, count: 0 }));
  for (const { e } of latest) buckets[Math.min(9, Math.floor(e.finalTotal / 10))].count++;

  const appeals = latest.flatMap(({ e }) => e.appeals);
  const changed = appeals.filter((a) => a.status === "CHANGED");

  return {
    totals: {
      conversations: conversations.length,
      evaluated: evaluated.length,
      avgScore: avg(latest.map(({ e }) => e.finalTotal)),
      avgOriginal: avg(latest.map(({ e }) => e.originalTotal)),
      criticalErrors: latest.filter(({ e }) => e.finalCritical).length,
      appeals: appeals.length,
      appealsOpen: appeals.filter((a) => a.status === "OPEN").length,
      appealsChanged: changed.length,
      appealsConfirmed: appeals.filter((a) => a.status === "CONFIRMED").length,
      avgAppealDelta: avg(changed.map((a) => (a.totalAfter ?? 0) - (a.totalBefore ?? 0))),
    },
    byLanguage: by("language"),
    byChannel: by("channel"),
    criteria: [...crit.values()]
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
      .map((c) => ({
        code: c.code,
        title: c.title,
        passRate: c.applicable ? round((c.scoreSum / c.applicable) * 100, 1) : null,
        naRate: c.n ? round((c.na / c.n) * 100, 1) : null,
        count: c.n,
      })),
    distribution: buckets,
    lowest: latest
      .sort((a, b) => a.e.finalTotal - b.e.finalTotal)
      .slice(0, 5)
      .map(({ c, e }) => ({ id: c.id, language: c.language, channel: c.channel, total: e.finalTotal, critical: e.finalCritical })),
  };
});
