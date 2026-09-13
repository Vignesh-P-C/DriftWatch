import "dotenv/config";
import { ReasoningProvider } from "./types.js";
import { GeminiReasoningProvider } from "./gemini.js";
import { OllamaReasoningProvider } from "./ollama.js";

// DRIFTWATCH_LLM_PROVIDER is the explicit switch: "gemini" | "ollama".
// If unset, falls back to the original behavior (GEMINI_API_KEY presence)
// so nobody's existing .env needs to change to keep working.
export function getReasoningProvider(): ReasoningProvider | null {
  const provider = process.env.DRIFTWATCH_LLM_PROVIDER?.toLowerCase();

  if (provider === "ollama") {
    return new OllamaReasoningProvider({
      host: process.env.OLLAMA_HOST,
      model: process.env.OLLAMA_MODEL,
    });
  }

  if (provider === "gemini") {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("DRIFTWATCH_LLM_PROVIDER=gemini is set but GEMINI_API_KEY is missing.");
    }
    return new GeminiReasoningProvider(process.env.GEMINI_API_KEY);
  }

  // No explicit provider chosen - preserve original behavior exactly.
  if (process.env.GEMINI_API_KEY) {
    return new GeminiReasoningProvider(process.env.GEMINI_API_KEY);
  }

  // Future providers (Claude, OpenAI, etc.) get added here as additional
  // branches on DRIFTWATCH_LLM_PROVIDER - never hardcode a single provider.
  return null;
}

export * from "./types.js";