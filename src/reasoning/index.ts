import "dotenv/config";
import { ReasoningProvider } from "./types.js";
import { GeminiReasoningProvider } from "./gemini.js";

export function getReasoningProvider(): ReasoningProvider | null {
  if (process.env.GEMINI_API_KEY) {
    return new GeminiReasoningProvider(process.env.GEMINI_API_KEY);
  }
  // Future providers (Claude, OpenAI, etc.) get added here as additional
  // env-var checks — never hardcode a single provider.
  return null;
}

export * from "./types.js";