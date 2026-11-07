// Server-side adapter for the organizers' temporary API (avoids CORS in the browser).
import { z } from "zod";

export const recordSchema = z.object({
  conversation_id: z.string().min(1),
  channel: z.string(),
  language: z.string().transform((s) => s.toUpperCase()),
  transcript: z.array(
    z.object({
      timestamp: z.string(),
      speaker: z.string().transform((s) => s.toLowerCase()),
      text: z.string(),
    }),
  ),
  // Empty strings count as "no recording"; only http(s) links are accepted.
  audio_url: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z
      .string()
      .trim()
      .url()
      .refine((u) => /^https?:\/\//i.test(u), "audio_url must be an http(s) link")
      .nullable()
      .optional(),
  ),
});

export type OrganizerRecord = z.infer<typeof recordSchema>;

const responseSchema = z.object({
  error: z.string().nullable().optional(),
  isSuccess: z.boolean(),
  data: z
    .object({
      dataset_group_id: z.string().optional(),
      total_records: z.number().optional(),
      records: z.array(recordSchema),
    })
    .nullable()
    .optional(),
});

export async function fetchDataset(groupId: string): Promise<OrganizerRecord[]> {
  const base = process.env.ORGANIZER_API_URL;
  if (!base) throw new Error("ORGANIZER_API_URL is not configured (see .env.example)");
  const url = new URL(base);
  url.searchParams.set("group_id", groupId);
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`Organizer API responded with HTTP ${res.status}`);
  const parsed = responseSchema.parse(await res.json());
  if (!parsed.isSuccess) throw new Error(parsed.error || "Organizer API returned isSuccess=false");
  return parsed.data?.records ?? [];
}

/**
 * Accepts the organizer response envelope (same shape as invoke.json), a bare array of records,
 * or a single record. Returns the dataset group from the envelope when present.
 */
export function parseUploaded(json: unknown): { groupId: string | null; records: OrganizerRecord[] } {
  if (json && typeof json === "object" && "data" in json) {
    const env = responseSchema.parse(json);
    if (!env.isSuccess) throw new Error(env.error || "The file has isSuccess=false");
    return { groupId: env.data?.dataset_group_id ?? null, records: env.data?.records ?? [] };
  }
  if (Array.isArray(json)) return { groupId: null, records: z.array(recordSchema).parse(json) };
  return { groupId: null, records: [recordSchema.parse(json)] };
}
