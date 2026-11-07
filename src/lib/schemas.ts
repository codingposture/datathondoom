import { z } from "zod";

const lang = z.array(z.string().trim().min(1)).optional();

export const criterionInput = z
  .object({
    code: z.string().trim().min(1).max(20),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(2000).default(""),
    sectionKey: z.string().nullable().default(null),
    answerType: z.enum(["BINARY", "SCALE"]),
    scaleMin: z.coerce.number().int().default(0),
    scaleMax: z.coerce.number().int().default(1),
    weight: z.coerce.number().min(0).max(1000),
    naAllowed: z.boolean().default(false),
    naRule: z.string().max(1000).default(""),
    isCritical: z.boolean().default(false),
    hints: z
      .object({
        detector: z.string().optional(),
        keywords: z.object({ RU: lang, KZ: lang, EN: lang }).partial().optional(),
      })
      .default({}),
  })
  .refine((c) => c.answerType === "BINARY" || c.scaleMax > c.scaleMin, {
    message: "scaleMax must be greater than scaleMin",
    path: ["scaleMax"],
  });

export const checklistInput = z
  .object({
    name: z.string().trim().min(1).max(200),
    decimals: z.coerce.number().int().min(0).max(4).default(1),
    roundingMode: z.enum(["half-up", "floor", "ceil"]).default("half-up"),
    criticalPolicy: z.enum(["flag", "zero-total"]).default("flag"),
    sections: z.array(z.object({ key: z.string().trim().min(1), name: z.string().trim().min(1) })).default([]),
    criteria: z.array(criterionInput).min(1, "A checklist needs at least one criterion"),
  })
  .superRefine((c, ctx) => {
    const keys = new Set(c.sections.map((s) => s.key));
    c.criteria.forEach((cr, i) => {
      if (cr.sectionKey && !keys.has(cr.sectionKey))
        ctx.addIssue({ code: "custom", message: `Unknown section "${cr.sectionKey}"`, path: ["criteria", i, "sectionKey"] });
    });
    const codes = c.criteria.map((x) => x.code);
    if (new Set(codes).size !== codes.length) ctx.addIssue({ code: "custom", message: "Criterion codes must be unique", path: ["criteria"] });
    if (c.criteria.every((x) => x.weight === 0)) ctx.addIssue({ code: "custom", message: "At least one criterion needs a weight above 0", path: ["criteria"] });
  });

export type ChecklistInput = z.infer<typeof checklistInput>;
