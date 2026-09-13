import { GoogleGenerativeAI } from "@google/generative-ai";
import { ConflictCandidate } from "../detector/overlap.js";
import { ConflictExplanation, ReasoningProvider } from "./types.js";
import { buildConflictPrompt, parseExplanationResponse } from "./prompt.js";

const MAX_REQUESTS_PER_MINUTE = 8;
const requestTimestamps: number[] = [];

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;
  while (requestTimestamps.length > 0 && requestTimestamps[0] < oneMinuteAgo) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    const waitMs = requestTimestamps[0] + 60_000 - now;
    await new Promise((resolve) => setTimeout(resolve, Math.max(waitMs, 0)));
    return waitForRateLimit();
  }
  requestTimestamps.push(now);
}

export class GeminiReasoningProvider implements ReasoningProvider {
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async explainConflict(candidate: ConflictCandidate): Promise<ConflictExplanation> {
    await waitForRateLimit();

    const model = this.client.getGenerativeModel({ model: "gemini-3.5-flash-lite" });
    const prompt = buildConflictPrompt(candidate);

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return parseExplanationResponse(text);
  }
}