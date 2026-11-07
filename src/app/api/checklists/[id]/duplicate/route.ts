import { handle, type Params } from "@/lib/api";
import { checklistInput } from "@/lib/schemas";
import { getChecklist, saveChecklistVersion } from "@/lib/services";

export const POST = handle(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const src = await getChecklist(id);
  const input = checklistInput.parse({
    ...src,
    name: `${src.name} (copy)`,
    sections: src.sections.map(({ key, name }) => ({ key, name })),
  });
  return saveChecklistVersion(input, undefined, false);
});
