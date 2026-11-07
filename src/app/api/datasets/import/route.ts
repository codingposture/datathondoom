import { z } from "zod";
import { handle } from "@/lib/api";
import { fetchDataset } from "@/lib/organizerApi";
import { importRecords } from "@/lib/services";

export const POST = handle(async (req: Request) => {
  const { groupId } = z.object({ groupId: z.string().trim().min(1) }).parse(await req.json());
  const records = await fetchDataset(groupId);
  return importRecords(groupId, records);
});
