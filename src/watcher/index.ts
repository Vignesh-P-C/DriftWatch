import chokidar from "chokidar";
import { getCurrentCommit, getMergeBase } from "../detector/git.js";
import { buildWorkingTreeChangedSymbolGraph } from "../detector/changed.js";
import { detectConflicts } from "../detector/overlap.js";
import { getReasoningProvider } from "../reasoning/index.js";
import { writeState, writeFallbackAlerts } from "../agent/adapter.js";
import { ExplainedConflict } from "../agent/types.js";
import { mapWithConcurrency } from "../reasoning/concurrency.js";

const DEBOUNCE_MS = 300;
const reasoningProvider = getReasoningProvider();

async function runCheck(pathA: string, pathB: string): Promise<void> {
  const commitA = getCurrentCommit(pathA);
  const commitB = getCurrentCommit(pathB);
  const mergeBase = getMergeBase(pathA, commitA, commitB);

  const changedInA = buildWorkingTreeChangedSymbolGraph(pathA, mergeBase);
  const changedInB = buildWorkingTreeChangedSymbolGraph(pathB, mergeBase);

  const candidates = detectConflicts(changedInA, changedInB, pathA, pathB);

  const timestamp = new Date().toLocaleTimeString();
  if (candidates.length === 0) {
    console.log(`[${timestamp}] No conflict candidates found.`);
    // Still write empty state so a stale HIGH conflict from a previous run
    // doesn't keep blocking edits after it's actually been resolved.
    if (reasoningProvider) {
      writeState(pathA, pathB, []);
      writeFallbackAlerts(pathA, pathB, []);
    }
    return;
  }

  console.log(`[${timestamp}] Found ${candidates.length} conflict candidate(s):`);

  for (const c of candidates) {
    console.log(
      `  - "${c.symbolName}" changed in worktree ${c.changedIn} ` +
        `(${c.changedAt.filePath}:${c.changedAt.startLine}-${c.changedAt.endLine}), ` +
        `used in worktree ${c.usedIn} at ${c.usageLocation.filePath}:${c.usageLocation.line}`
    );
  }

  const explained: ExplainedConflict[] = [];

  if (reasoningProvider) {
    // Bounded concurrency, not a bare Promise.all — keeps the number of
    // simultaneous Gemini calls under a configurable cap instead of firing
    // one request per candidate at once. Google no longer publishes a fixed
    // free-tier RPM table (it's per-project now, visible in AI Studio), so
    // this defaults conservative; raise DRIFTWATCH_LLM_CONCURRENCY once you've
    // checked your project's actual current limit.
    const concurrency = Number(process.env.DRIFTWATCH_LLM_CONCURRENCY) || 3;

    const results = await mapWithConcurrency(candidates, concurrency, (c) =>
      reasoningProvider.explainConflict(c)
    );

    results.forEach((result, i) => {
      const c = candidates[i];
      if (result.status === "fulfilled") {
        console.log(`    [${result.value.severity.toUpperCase()}] ${result.value.explanation}`);
        explained.push({ candidate: c, explanation: result.value });
      } else {
        console.log(`    (reasoning failed for "${c.symbolName}": ${(result.reason as Error).message})`);

        // Same "fail open per candidate" behavior as before — a candidate
        // whose reasoning call failed has no severity, so it can't be
        // evaluated by the hook, and is deliberately excluded from `explained`.
      }
    });
  }

  if (reasoningProvider) {
    writeState(pathA, pathB, explained);
    writeFallbackAlerts(pathA, pathB, explained);
  }
}

export function watch(pathA: string, pathB: string): void {
  let debounceTimer: NodeJS.Timeout | null = null;

  const triggerCheck = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      runCheck(pathA, pathB).catch((err) => console.error("Check failed:", err));
    }, DEBOUNCE_MS);
  };

  const watcher = chokidar.watch([pathA, pathB], {
  ignored: /node_modules|\.git|\.driftwatch/,
  ignoreInitial: true,
  });

  watcher.on("all", (event, filePath) => {
    console.log(`[watch] ${event}: ${filePath}`);
    triggerCheck();
  });

  console.log(`Watching ${pathA} and ${pathB} for changes...`);
  if (!reasoningProvider) {
    console.log("(No LLM provider configured — showing raw conflict candidates only. Set GEMINI_API_KEY in .env to enable explanations.)");
  }
  runCheck(pathA, pathB).catch((err) => console.error("Initial check failed:", err));
}