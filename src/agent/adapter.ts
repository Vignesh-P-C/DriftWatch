// src/agent/adapter.ts — corrected writeState and getActiveConflictFor
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { DriftwatchState, ExplainedConflict } from "./types.js";

const STATE_RELATIVE_PATH = ".driftwatch/state.json";

function toAbsoluteConflict(c: ExplainedConflict): ExplainedConflict {
  // resolve() with no base uses process.cwd() — correct here because writeState
  // runs in the same process, same cwd, as the detection that produced these paths.
  return {
    ...c,
    candidate: {
      ...c.candidate,
      changedAt: { ...c.candidate.changedAt, filePath: resolve(c.candidate.changedAt.filePath) },
      usageLocation: { ...c.candidate.usageLocation, filePath: resolve(c.candidate.usageLocation.filePath) },
    },
  };
}

export function writeState(
  worktreeA: string,
  worktreeB: string,
  conflicts: ExplainedConflict[]
): void {
  const state: DriftwatchState = {
    generatedAt: new Date().toISOString(),
    worktreeA: resolve(worktreeA),
    worktreeB: resolve(worktreeB),
    conflicts: conflicts.map(toAbsoluteConflict),
  };
  const json = JSON.stringify(state, null, 2);

  for (const worktree of [worktreeA, worktreeB]) {
    const outPath = join(worktree, STATE_RELATIVE_PATH);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, json, "utf8");
  }
}

// filePath here is whatever the hook receives — Claude Code hooks pass absolute
// paths in tool_input.file_path, so resolve() is a no-op safety net, not a fix.
export function getActiveConflictFor(
  worktreeRoot: string,
  filePath: string
): ExplainedConflict | null {
  const statePath = join(worktreeRoot, STATE_RELATIVE_PATH);

  let state: DriftwatchState;
  try {
    state = JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return null;
  }

  const target = resolve(filePath);

  return (
    state.conflicts.find(
      (c) => c.explanation.severity === "high" && c.candidate.usageLocation.filePath === target
    ) ?? null
  );
}