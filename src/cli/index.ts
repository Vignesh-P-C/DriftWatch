#!/usr/bin/env node
import { existsSync } from "node:fs";
import { getCurrentCommit, getMergeBase } from "../detector/git.js";
import { buildChangedSymbolGraph } from "../detector/changed.js";
import { detectConflicts } from "../detector/overlap.js";
import { watch } from "../watcher/index.js";

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
  } else {
    console.log(`\nFound ${candidates.length} conflict candidate(s):\n`);
    for (const c of candidates) {
      console.log(
        `- "${c.symbolName}" changed in worktree ${c.changedIn} ` +
          `(${c.changedAt.filePath}:${c.changedAt.startLine}-${c.changedAt.endLine}), ` +
          `used in worktree ${c.usedIn} at ${c.usageLocation.filePath}:${c.usageLocation.line}`
      );
    }
  }
}