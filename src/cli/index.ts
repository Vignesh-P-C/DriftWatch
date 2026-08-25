#!/usr/bin/env node
import { existsSync } from "node:fs";
import { buildGraphForWorktree } from "../graph/walker.js";

const [, , cmd, pathA, pathB] = process.argv;

if (cmd !== "check" || !pathA || !pathB) {
  console.error("Usage: driftwatch check <worktreeA> <worktreeB>");
  process.exit(1);
}

for (const p of [pathA, pathB]) {
  if (!existsSync(p)) {
    console.error(`Path does not exist: ${p}`);
    process.exit(1);
  }
}

console.log(`Checking ${pathA} against ${pathB}...`);

const graphA = buildGraphForWorktree(pathA);
const graphB = buildGraphForWorktree(pathB);

console.log(`Worktree A: ${graphA.size} unique symbol names`);
console.log(`Worktree B: ${graphB.size} unique symbol names`);