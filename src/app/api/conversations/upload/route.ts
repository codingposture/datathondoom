import { z } from "zod";
import { handle } from "@/lib/api";
import { parseUploaded } from "@/lib/organizerApi";
import { HttpError, importRecords } from "@/lib/services";

/**
 * Manual upload of dialogs in the organizer JSON format (e.g. invoke.json).
 * Body: { groupId?, data }. The group is taken from the body, then from data.dataset_group_id, else "UPLOAD".
 * Each record may carry an audio_url; the dialog card then shows the recording player.
 */
export const POST = handle(async (req: Request) => {
  const body = z.object({ groupId: z.string().trim().optional(), data: z.unknown() }).parse(await req.json());
  const parsed = parseUploaded(body.data);
  if (!parsed.records.length) throw new HttpError(400, "The file contains no records");
  const groupId = body.groupId || parsed.groupId || "UPLOAD";
  const result = await importRecords(groupId, parsed.records);
  return { ...result, withAudio: parsed.records.filter((r) => r.audio_url).length };
});
