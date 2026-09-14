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

Here are two worked examples of correct analysis, to show the level of care expected. These use unrelated code, purely to illustrate the reasoning process - do not let their specifics influence the real case below.

EXAMPLE 1 (should be HIGH):
Definition: function formatPrice(amountCents: number, currencyCode: string, locale: string): string { ... }
Usage: return formatPrice(1999, "USD");
Correct analysis: The definition has 3 parameters (amountCents, currencyCode, locale). The usage call has 2 arguments (1999, "USD"). These counts do not match. This will cause a compile error or incorrect runtime behavior.
Correct output: {"severity": "high", "explanation": "formatPrice now requires three parameters (amountCents, currencyCode, locale), but this call site only provides two arguments (1999, \"USD\")."}

EXAMPLE 2 (should be LOW):
Definition: function getUserDisplayName(user: User): string { const trimmed = user.name.trim(); return trimmed; }
Usage: const label = getUserDisplayName(currentUser);
Correct analysis: The definition has 1 parameter (user). The usage call has 1 argument (currentUser). These counts match. The internal implementation detail (adding a local variable) does not change the signature or behavior.
Correct output: {"severity": "low", "explanation": "The change only affects internal implementation (introducing a local variable); the signature and return behavior are unchanged, so this usage remains safe."}

Now analyze this real case with the same care:

Symbol "${candidate.symbolName}" was changed in worktree ${candidate.changedIn}, at ${candidate.changedAt.filePath} (lines ${candidate.changedAt.startLine}-${candidate.changedAt.endLine}). Here is its current definition:

\`\`\`
${changedSnippet}
\`\`\`

It is used in worktree ${candidate.usedIn}, at ${candidate.usageLocation.filePath}, line ${candidate.usageLocation.line}. Here is that usage site:

\`\`\`
${usageSnippet}
\`\`\`

Before deciding, work through this explicitly:
1. Count the parameters in the definition shown above.
2. Count the arguments in the usage call shown above.
3. State internally whether these counts match (do not include this scratch work in your output).
4. If the counts don't match, or the changed code's return type or behavior clearly differs from what the usage site expects, this is almost always HIGH severity — a mismatch here typically causes a compile error or a runtime crash, not a subtle bug.
5. Only mark something LOW if the call site's usage is genuinely unaffected by the change (e.g. an internal-only change with the same signature and behavior).

Based on the ACTUAL CODE shown above (not just the fact that a change happened, and not the two examples, which are illustrations only), determine whether this usage is genuinely likely to break — e.g. argument count mismatch, changed return type, renamed behavior — or whether it's actually safe.

Respond ONLY with the final JSON below, no markdown, no preamble, and no restatement of your step-by-step reasoning, in this exact shape:
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