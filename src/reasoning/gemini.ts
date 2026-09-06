import { readFileSync } from "node:fs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ConflictCandidate } from "../detector/overlap.js";
import { ConflictExplanation, ReasoningProvider, Severity } from "./types.js";

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

function readLines(filePath: string, startLine: number, endLine: number): string {
  try {
    const source = readFileSync(filePath, "utf8");
    const lines = source.split("\n");
    // pad one line of context on each side where available
    const from = Math.max(0, startLine - 2);
    const to = Math.min(lines.length, endLine + 1);
    return lines.slice(from, to).join("\n");
  } catch {
    return "(could not read source)";
  }
}

function parseResponse(text: string): ConflictExplanation {
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const severity: Severity = ["low", "medium", "high"].includes(parsed.severity)
      ? parsed.severity
      : "medium";
    return {
      severity,
      explanation: typeof parsed.explanation === "string" ? parsed.explanation : text,
    };
  } catch {
    return { severity: "medium", explanation: text };
  }
}

export class GeminiReasoningProvider implements ReasoningProvider {
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async explainConflict(candidate: ConflictCandidate): Promise<ConflictExplanation> {
    await waitForRateLimit();

    const model = this.client.getGenerativeModel({ model: "gemini-3.5-flash-lite" });

    const changedSnippet = readLines(
      candidate.changedAt.filePath,
      candidate.changedAt.startLine,
      candidate.changedAt.endLine
    );
    const usageSnippet = readLines(
      candidate.usageLocation.filePath,
      candidate.usageLocation.line,
      candidate.usageLocation.line
    );

    const prompt = `You are analyzing a potential semantic conflict between two git worktrees, where two developers or AI agents are working in parallel on the same codebase.

Symbol "${candidate.symbolName}" was changed in worktree ${candidate.changedIn}, at ${candidate.changedAt.filePath} (lines ${candidate.changedAt.startLine}-${candidate.changedAt.endLine}). Here is its current definition:

\`\`\`
${changedSnippet}
\`\`\`

It is used in worktree ${candidate.usedIn}, at ${candidate.usageLocation.filePath}, line ${candidate.usageLocation.line}. Here is that usage site:

\`\`\`
${usageSnippet}
\`\`\`

Based on the ACTUAL CODE shown above (not just the fact that a change happened), determine whether this usage is genuinely likely to break — e.g. argument count mismatch, changed return type, renamed behavior — or whether it's actually safe (e.g. the change was internal-only and doesn't affect the call signature).

Respond ONLY with JSON, no markdown, no preamble, in this exact shape:
{"severity": "low" | "medium" | "high", "explanation": "one or two plain-English sentences citing the SPECIFIC discrepancy you see between the definition and the usage, or explaining why it's safe"}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return parseResponse(text);
  }
}