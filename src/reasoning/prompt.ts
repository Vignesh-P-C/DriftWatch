// Shared between all reasoning providers so their prompts and response
// parsing never silently drift apart from one another — extracted out of
// gemini.ts, which used to own this logic privately.
import { readFileSync } from "node:fs";
import { ConflictCandidate } from "../detector/overlap.js";
import { ConflictExplanation, Severity } from "./types.js";

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

export function buildConflictPrompt(candidate: ConflictCandidate): string {
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

  return `You are analyzing a potential semantic conflict between two git worktrees, where two developers or AI agents are working in parallel on the same codebase.

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
}

export function parseExplanationResponse(text: string): ConflictExplanation {
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