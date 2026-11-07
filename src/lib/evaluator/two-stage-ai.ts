/**
 * Two-Stage AI Evaluator:
 * Stage 1 (AI #1): Dialogue & Audio/Transcript Analyzer -> extracts facts, pauses, quotes, violations.
 * Stage 2 (AI #2): Quality Auditor & Checklist Judge -> maps findings to criteria, scales, weights & N/A rules.
 */
import { runConversationAnalyzer } from "./ai-analyzer";
import { runChecklistJudge } from "./ai-judge";
import type { AudioBundle } from "../audio/metrics";
import type { Evaluator } from "./types";
import type { ChecklistDef, ConversationDto, CriterionVerdict, MessageDto } from "../types";

export const twoStageAiEvaluator: Evaluator = {
  name: "two-stage-ai-v1",
  wantsAudioBytes: true,
  async evaluate({
    conversation,
    messages,
    checklist,
    audio,
  }: {
    conversation: ConversationDto;
    messages: MessageDto[];
    checklist: ChecklistDef;
    audio?: AudioBundle | null;
  }): Promise<CriterionVerdict[]> {
    // 1. Stage 1: AI #1 analyzes transcript and audio cues
    const dossier = await runConversationAnalyzer(conversation, messages, audio ?? null);

    // 2. Stage 2: AI #2 evaluates the criteria against the dossier
    const verdicts = await runChecklistJudge(dossier, checklist, messages);

    return verdicts;
  },
};
