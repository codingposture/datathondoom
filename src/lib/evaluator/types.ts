import type { AudioBundle } from "../audio/metrics";
import type { ChecklistDef, ConversationDto, CriterionVerdict, MessageDto } from "../types";

/**
 * An evaluator grades the operator's work against a checklist.
 * Bot and system messages are context only; only operator behaviour is scored.
 * For calls, `audio` carries objective voice metrics measured from the recording (and the raw audio
 * when the evaluator sets `wantsAudioBytes`, e.g. a multimodal LLM).
 */
export interface Evaluator {
  name: string;
  wantsAudioBytes?: boolean;
  evaluate(input: {
    conversation: ConversationDto;
    messages: MessageDto[];
    checklist: ChecklistDef;
    audio?: AudioBundle | null;
  }): Promise<CriterionVerdict[]>;
}
