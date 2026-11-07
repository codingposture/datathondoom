import { mockEvaluator } from "./mock";
import type { Evaluator } from "./types";

const registry: Record<string, Evaluator> = {
  mock: mockEvaluator,
  // Add LLM-backed evaluators here, e.g. llm: llmEvaluator,
};

export function getEvaluator(): Evaluator {
  const key = process.env.EVALUATOR ?? "mock";
  return registry[key] ?? mockEvaluator;
}
