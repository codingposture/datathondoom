import { z } from "zod";
import { handle } from "@/lib/api";
import { parseUploaded } from "@/lib/organizerApi";
import { importRecords } from "@/lib/services";

/** Manual transcript upload: body { groupId?, data } where data is an API envelope, array of records or one record. */
export const POST = handle(async (req: Request) => {
  const body = z.object({ groupId: z.string().trim().min(1).default("UPLOAD"), data: z.unknown() }).parse(await req.json());
  return importRecords(body.groupId, parseUploaded(body.data));
});
