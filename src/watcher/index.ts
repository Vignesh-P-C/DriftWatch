import chokidar from "chokidar";
import { getCurrentCommit, getMergeBase } from "../detector/git.js";
import { buildWorkingTreeChangedSymbolGraph } from "../detector/changed.js";
import { detectConflicts } from "../detector/overlap.js";

const DEBOUNCE_MS = 300;

function runCheck(pathA: string, pathB: string): void {
  const commitA = getCurrentCommit(pathA);
  const commitB = getCurrentCommit(pathB);
  const mergeBase = getMergeBase(pathA, commitA, commitB);

  const changedInA = buildWorkingTreeChangedSymbolGraph(pathA, mergeBase);
  const changedInB = buildWorkingTreeChangedSymbolGraph(pathB, mergeBase);

  const candidates = detectConflicts(changedInA, changedInB, pathA, pathB);

  const timestamp = new Date().toLocaleTimeString();
  if (candidates.length === 0) {
    console.log(`[${timestamp}] No conflict candidates found.`);
  } else {
    console.log(`[${timestamp}] Found ${candidates.length} conflict candidate(s):`);
    for (const c of candidates) {
      console.log(
        `  - "${c.symbolName}" changed in worktree ${c.changedIn} ` +
          `(${c.changedAt.filePath}:${c.changedAt.startLine}-${c.changedAt.endLine}), ` +
          `used in worktree ${c.usedIn} at ${c.usageLocation.filePath}:${c.usageLocation.line}`
      );
    }
  }
}


export function watch(pathA: string, pathB: string): void {
  let debounceTimer: NodeJS.Timeout | null = null;

  const triggerCheck = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runCheck(pathA, pathB), DEBOUNCE_MS);
  };

  const watcher = chokidar.watch([pathA, pathB], {
    ignored: /node_modules|\.git/,
    ignoreInitial: true,
  });

  watcher.on("all", (event, filePath) => {
    console.log(`[watch] ${event}: ${filePath}`);
    triggerCheck();
  });

  console.log(`Watching ${pathA} and ${pathB} for changes...`);
  runCheck(pathA, pathB);
}