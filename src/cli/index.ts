#!/usr/bin/env node
import { existsSync } from "node:fs";
import { getCurrentCommit, getMergeBase } from "../detector/git.js";
import { buildChangedSymbolGraph } from "../detector/changed.js";
import { detectConflicts } from "../detector/overlap.js";
import { watch } from "../watcher/index.js";
import { getReasoningProvider } from "../reasoning/index.js";

const [, , cmd, pathA, pathB] = process.argv;

if ((cmd !== "check" && cmd !== "watch") || !pathA || !pathB) {
  console.error("Usage: driftwatch <check|watch> <worktreeA> <worktreeB>");
  process.exit(1);
}

for (const p of [pathA, pathB]) {
  if (!existsSync(p)) {
    console.error(`Path does not exist: ${p}`);
    process.exit(1);
  }
}

if (cmd === "watch") {
  watch(pathA, pathB);
} else {
  (async () => {
    await runCheckOnce(pathA, pathB);
  })();
}
async function runCheckOnce(pathA: string, pathB: string): Promise<void> {
  console.log(`Checking ${pathA} against ${pathB}...`);

  const commitA = getCurrentCommit(pathA);
  const commitB = getCurrentCommit(pathB);
  const mergeBase = getMergeBase(pathA, commitA, commitB);

  const changedInA = buildChangedSymbolGraph(pathA, mergeBase, commitA);
  const changedInB = buildChangedSymbolGraph(pathB, mergeBase, commitB);

  console.log(`Changed declarations in A: ${[...changedInA.keys()].join(", ") || "none"}`);
  console.log(`Changed declarations in B: ${[...changedInB.keys()].join(", ") || "none"}`);

  const candidates = detectConflicts(changedInA, changedInB, pathA, pathB);

  if (candidates.length === 0) {
    console.log("\nNo conflict candidates found.");
    return;
  }

  console.log(`\nFound ${candidates.length} conflict candidate(s):\n`);
  const reasoningProvider = getReasoningProvider();
  if (!reasoningProvider) {
    console.log("(No LLM provider configured — showing raw conflict candidates only. Set GEMINI_API_KEY in .env to enable explanations.)\n");
  }

  for (const c of candidates) {
    console.log(
      `- "${c.symbolName}" changed in worktree ${c.changedIn} ` +
        `(${c.changedAt.filePath}:${c.changedAt.startLine}-${c.changedAt.endLine}), ` +
        `used in worktree ${c.usedIn} at ${c.usageLocation.filePath}:${c.usageLocation.line}`
    );
    if (reasoningProvider) {
      try {
        const { severity, explanation } = await reasoningProvider.explainConflict(c);
        console.log(`  [${severity.toUpperCase()}] ${explanation}`);
      } catch (err) {
        console.log(`  (reasoning failed: ${(err as Error).message})`);
      }
    }
  }
}