// Shared domain types used by both the API routes and the UI.

export type Lang = "RU" | "KZ" | "EN";
export type Speaker = "client" | "operator" | "bot" | "system";
export type AnswerType = "BINARY" | "SCALE";
export type RoundingMode = "half-up" | "floor" | "ceil";
export type CriticalPolicy = "flag" | "zero-total";

/** Answer stored as a string: "yes" | "no" | "na" | numeric string for scales. */
export type Answer = string;

export type Detector =
  | "greeting"
  | "need"
  | "consultation"
  | "security"
  | "politeness"
  | "wait"
  | "escalation"
  | "closing"
  | "keywords" // operator must use one of the keywords
  | "keywords_absent"; // operator must NOT use any of the keywords

export interface CriterionHints {
  detector?: Detector;
  keywords?: Partial<Record<Lang, string[]>>;
}

export interface SectionDef {
  key: string;
  name: string;
  order: number;
}

export interface CriterionDef {
  id: string;
  code: string;
  title: string;
  description: string;
  sectionKey: string | null;
  answerType: AnswerType;
  scaleMin: number;
  scaleMax: number;
  weight: number;
  naAllowed: boolean;
  naRule: string;
  isCritical: boolean;
  hints: CriterionHints;
  order: number;
}

export interface ChecklistDef {
  id: string;
  family: string;
  name: string;
  version: number;
  isActive: boolean;
  decimals: number;
  roundingMode: RoundingMode;
  criticalPolicy: CriticalPolicy;
  createdAt?: string;
  sections: SectionDef[];
  criteria: CriterionDef[];
}

export interface MessageDto {
  idx: number;
  timestamp: string;
  offsetSec: number;
  speaker: Speaker;
  text: string;
  /** Position of the utterance inside the recording (seconds); null for chats or unrecorded parts. */
  audioStart: number | null;
  audioEnd: number | null;
}

export interface ConversationDto {
  id: string;
  groupId: string;
  channel: string;
  language: Lang;
  audioUrl: string | null;
  durationSec: number;
}

/** What an evaluator returns for one criterion (before scoring). */
export interface CriterionVerdict {
  criterionId: string;
  answer: Answer;
  explanation: string;
  evidenceIdx: number[];
  checkedRange?: { from: number; to: number } | null;
  naReason?: string | null;
}

export interface ScoredCriterion {
  criterionId: string;
  answer: Answer;
  points: number;
  maxPoints: number;
  effectiveWeight: number;
  failedCritical: boolean;
}

export interface SectionScore {
  key: string;
  name: string;
  points: number;
  maxPoints: number;
  percent: number | null; // null when the whole section is N/A
}

export interface ScoreResult {
  total: number;
  rawTotal: number;
  hasCriticalError: boolean;
  criteria: ScoredCriterion[];
  sections: SectionScore[];
}

export interface CriterionResultDto {
  id: string;
  criterionId: string;
  code: string;
  answer: Answer;
  points: number;
  maxPoints: number;
  effectiveWeight: number;
  explanation: string;
  evidenceIdx: number[];
  checkedFrom: number | null;
  checkedTo: number | null;
  naReason: string | null;
  finalAnswer: Answer;
  finalPoints: number;
  finalMaxPoints: number;
}

export interface AppealDto {
  id: string;
  evaluationId: string;
  criterionResultId: string;
  comment: string;
  status: "OPEN" | "CONFIRMED" | "CHANGED";
  previousAnswer: Answer;
  newAnswer: Answer | null;
  reviewerReason: string | null;
  totalBefore: number | null;
  totalAfter: number | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface EvaluationDto {
  id: string;
  conversationId: string;
  checklistId: string;
  checklist: ChecklistDef; // snapshot
  evaluator: string;
  originalTotal: number;
  finalTotal: number;
  hasCriticalError: boolean;
  finalCritical: boolean;
  sectionScores: SectionScore[];
  finalSections: SectionScore[];
  createdAt: string;
  results: CriterionResultDto[];
  appeals: AppealDto[];
}
