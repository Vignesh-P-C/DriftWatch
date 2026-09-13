import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getReasoningProvider } from "./index.js";
import { GeminiReasoningProvider } from "./gemini.js";
import { OllamaReasoningProvider } from "./ollama.js";

// This file exists mainly so reasoning/index.ts is actually imported by the
// test suite at all. Its exports weren't touched by any other test file, so
// a syntax error or duplicate declaration there (as happened once already)
// could pass `npm test` silently. Importing it here means a broken index.ts
// fails the test run instead of only failing at `npm run dev -- watch`.

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.DRIFTWATCH_LLM_PROVIDER;
  delete process.env.GEMINI_API_KEY;
  delete process.env.OLLAMA_HOST;
  delete process.env.OLLAMA_MODEL;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getReasoningProvider", () => {
  it("returns null when nothing is configured", () => {
    expect(getReasoningProvider()).toBeNull();
  });

  it("defaults to Gemini when only GEMINI_API_KEY is set (backward compatible)", () => {
    process.env.GEMINI_API_KEY = "fake-key-for-test";
    const provider = getReasoningProvider();
    expect(provider).toBeInstanceOf(GeminiReasoningProvider);
  });

  it("returns Ollama when DRIFTWATCH_LLM_PROVIDER=ollama, no API key needed", () => {
    process.env.DRIFTWATCH_LLM_PROVIDER = "ollama";
    const provider = getReasoningProvider();
    expect(provider).toBeInstanceOf(OllamaReasoningProvider);
  });

  it("returns Gemini when DRIFTWATCH_LLM_PROVIDER=gemini and a key is present", () => {
    process.env.DRIFTWATCH_LLM_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "fake-key-for-test";
    const provider = getReasoningProvider();
    expect(provider).toBeInstanceOf(GeminiReasoningProvider);
  });

  it("throws a clear error when DRIFTWATCH_LLM_PROVIDER=gemini but no key is set", () => {
    process.env.DRIFTWATCH_LLM_PROVIDER = "gemini";
    expect(() => getReasoningProvider()).toThrow(/GEMINI_API_KEY is missing/);
  });
});