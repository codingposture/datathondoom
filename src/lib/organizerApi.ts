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
  audio_url: z.string().nullable().optional(),
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

/** Accepts the organizer response envelope, a bare array of records, or a single record. */
export function parseUploaded(json: unknown): OrganizerRecord[] {
  const env = responseSchema.safeParse(json);
  if (env.success && env.data.data) return env.data.data.records;
  const arr = z.array(recordSchema).safeParse(json);
  if (arr.success) return arr.data;
  return [recordSchema.parse(json)];
}
