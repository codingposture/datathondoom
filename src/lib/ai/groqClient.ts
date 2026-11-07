/**
 * Native fetch-based client for Groq Cloud API (OpenAI-compatible).
 * Extremely fast LPU inference (~500+ tokens/sec) for text analysis and scoring.
 * Zero external npm dependencies.
 */
import { parseLlmJson } from "./geminiClient";

export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GroqChatOptions {
  model?: string;
  messages: GroqMessage[];
  temperature?: number;
  jsonMode?: boolean;
}

export class GroqApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(`Groq API error (${statusCode}): ${message}`);
  }
}

export function getGroqApiKey(): string | null {
  const key = process.env.GROQ_API_KEY;
  return key && key.trim() !== "" ? key.trim() : null;
}

export function getGroqModel(defaultModel = "openai/gpt-oss-120b"): string {
  return process.env.GROQ_MODEL?.trim() || defaultModel;
}

/**
 * Call Groq Cloud /chat/completions endpoint.
 */
export async function callGroq(options: GroqChatOptions): Promise<string> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set in environment.");
  }

  const model = options.model || getGroqModel();
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const payload: Record<string, unknown> = {
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0.1,
  };

  if (options.jsonMode) {
    payload.response_format = { type: "json_object" };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    // If gpt-oss-120b has an issue, try gpt-oss-20b as fallback
    if (model === "openai/gpt-oss-120b" && (response.status === 429 || response.status >= 500)) {
      console.warn("Groq 120b throttled, trying 20b fallback...");
      return callGroq({ ...options, model: "openai/gpt-oss-20b" });
    }
    throw new GroqApiError(response.status, errorText);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const text = data.choices?.[0]?.message?.content;
  if (!text || text.trim() === "") {
    throw new Error("Groq returned an empty response.");
  }

  return text;
}

export { parseLlmJson };
