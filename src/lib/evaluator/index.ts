import { mockEvaluator } from "./mock";
import { twoStageAiEvaluator } from "./two-stage-ai";
import type { Evaluator } from "./types";

const registry: Record<string, Evaluator> = {
  mock: mockEvaluator,
  "two-stage-ai": twoStageAiEvaluator,
  gemini: twoStageAiEvaluator,
};

export function getEvaluator(): Evaluator {
  const key = process.env.EVALUATOR;
  if (key && registry[key]) {
    return registry[key];
  }
  // If GEMINI_API_KEY is configured, default to the two-stage AI evaluator!
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== "") {
    return twoStageAiEvaluator;
  }
  return mockEvaluator;
}
