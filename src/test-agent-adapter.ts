// test-agent-adapter.ts — throwaway script, not part of the CLI.
// Proves writeState + getActiveConflictFor work correctly before wiring into watch/hooks.
import { resolve } from "node:path";
import { writeState, getActiveConflictFor } from "./agent/adapter.js";
import { ExplainedConflict } from "./agent/types.js";

const worktreeA = process.cwd();
const worktreeB = resolve(process.cwd(), "..", "driftwatch-b");

// Mirrors tonight's real result: add() gained a param, HIGH severity.
const highConflict: ExplainedConflict = {
  candidate: {
    symbolName: "add",
    changedIn: "A",
    changedAt: { filePath: resolve(worktreeA, "src/graph/sample.ts"), startLine: 1, endLine: 3 },
    usedIn: "B",
    usageLocation: { name: "add", filePath: resolve(worktreeB, "src/graph/sample.ts"), line: 11 },
  },
  explanation: {
    severity: "high",
    explanation:
      "The function add now requires three parameters (a, b, c), but the usage site in worktree B only provides two arguments (2, 3).",
  },
};

// Mirrors one of tonight's real LOW results — should never block anything.
const lowConflict: ExplainedConflict = {
  candidate: {
    symbolName: "watch",
    changedIn: "A",
    changedAt: { filePath: resolve(worktreeA, "src/watcher/index.ts"), startLine: 46, endLine: 72 },
    usedIn: "B",

    usageLocation: { name: "watch", filePath: resolve(worktreeB, "src/cli/index.ts"), line: 23 },
  },
  explanation: {
    severity: "low",
    explanation: "Call signature is unchanged and safe.",
  },
};

writeState(worktreeA, worktreeB, [highConflict, lowConflict]);
console.log("State written to both worktrees.\n");

// Test 1: the file with a real HIGH conflict should match.
const shouldMatch = getActiveConflictFor(worktreeB, resolve(worktreeB, "src/graph/sample.ts"));
console.log("Test 1 (expect HIGH match):", shouldMatch ? shouldMatch.explanation.severity : "NULL — FAIL");

// Test 2: a file with only a LOW conflict should NOT match (LOW never blocks).
const shouldNotMatchLow = getActiveConflictFor(worktreeB, resolve(worktreeB, "src/cli/index.ts"));
console.log("Test 2 (expect null, LOW excluded):", shouldNotMatchLow === null ? "PASS" : "FAIL — matched something");

// Test 3: a file with no conflict at all should return null.
const shouldNotMatchUnrelated = getActiveConflictFor(worktreeB, resolve(worktreeB, "package.json"));
console.log("Test 3 (expect null, unrelated file):", shouldNotMatchUnrelated === null ? "PASS" : "FAIL — matched something");