/**
 * Two-Stage AI Evaluator:
 * Stage 1 (AI #1): Dialogue & Audio/Transcript Analyzer -> extracts facts, pauses, quotes, violations.
 * Stage 2 (AI #2): Quality Auditor & Checklist Judge -> maps findings to criteria, scales, weights & N/A rules.
 */
import { runConversationAnalyzer } from "./ai-analyzer";
import { runChecklistJudge } from "./ai-judge";
import type { Evaluator } from "./types";
import type { ChecklistDef, ConversationDto, CriterionVerdict, MessageDto } from "../types";

export const twoStageAiEvaluator: Evaluator = {
  name: "two-stage-ai-v1",
  async evaluate({
    conversation,
    messages,
    checklist,
  }: {
    conversation: ConversationDto;
    messages: MessageDto[];
    checklist: ChecklistDef;
  }): Promise<CriterionVerdict[]> {
    // 1. Stage 1: AI #1 analyzes transcript and audio cues
    const dossier = await runConversationAnalyzer(conversation, messages);

    // 2. Stage 2: AI #2 evaluates the criteria against the dossier
    const verdicts = await runChecklistJudge(dossier, checklist, messages);

    return verdicts;
  },
};
