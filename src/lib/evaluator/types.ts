import type { ChecklistDef, ConversationDto, CriterionVerdict, MessageDto } from "../types";

/**
 * An evaluator grades the operator's work against a checklist.
 * Bot and system messages are context only; only operator behaviour is scored.
 * Implementations: mock (deterministic heuristics). Add LLM providers alongside it.
 */
export interface Evaluator {
  name: string;
  evaluate(input: {
    conversation: ConversationDto;
    messages: MessageDto[];
    checklist: ChecklistDef;
  }): Promise<CriterionVerdict[]>;
}
