/**
 * Clean native fetch-based client for Google Gemini API.
 * Requires no external npm packages (works natively in Node.js 18+ / 20+).
 */

export interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string; // base64 encoded
  };
}

export interface GeminiContent {
  role?: "user" | "model" | "system";
  parts: GeminiPart[];
}

export interface GeminiGenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
}

export interface GeminiGenerateOptions {
  model?: string;
  systemInstruction?: string;
  contents: GeminiContent[];
  generationConfig?: GeminiGenerationConfig;
}

export class GeminiApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(`Gemini API error (${statusCode}): ${message}`);
  }
}

export function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.trim() === "") {
    throw new Error(
      "GEMINI_API_KEY is not set. Please add GEMINI_API_KEY to your .env file."
    );
  }
  return key.trim();
}

export function getGeminiModel(defaultModel = "gemini-2.0-flash"): string {
  return process.env.GEMINI_MODEL || defaultModel;
}

/**
 * Call the Gemini generateContent endpoint.
 */
export async function callGemini(options: GeminiGenerateOptions): Promise<string> {
  const apiKey = getGeminiApiKey();
  const model = options.model || getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;

  const body: Record<string, unknown> = {
    contents: options.contents,
  };

  if (options.systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: options.systemInstruction }],
    };
  }

  if (options.generationConfig) {
    body.generationConfig = options.generationConfig;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new GeminiApiError(response.status, errorText);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const parts = data.candidates?.[0]?.content?.parts || [];
  // Join all text parts (or pick the non-thought parts if marked)
  const text = parts
    .filter((p: { text?: string; thought?: boolean }) => !p.thought && typeof p.text === "string")
    .map((p: { text?: string }) => p.text)
    .join("") || parts.map((p: { text?: string }) => p.text || "").join("");

  if (!text || text.trim() === "") {
    throw new Error("Gemini returned an empty response or unexpected structure.");
  }

  return text;
}

/**
 * Safely parse JSON from LLM output, stripping potential markdown blocks.
 */
export function parseLlmJson<T>(rawText: string): T {
  let cleaned = rawText.trim();
  // Strip ```json ... ``` or ``` ... ```
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    // Try to find the first { or [ and last } or ]
    const firstBrace = cleaned.search(/[\{\[]/);
    const lastBrace = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const slice = cleaned.slice(firstBrace, lastBrace + 1);
      return JSON.parse(slice) as T;
    }
    throw new Error(`Failed to parse LLM JSON: ${(err as Error).message}\nRaw text: ${rawText.slice(0, 500)}`);
  }
}
