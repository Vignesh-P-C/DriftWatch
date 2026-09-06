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

const ALERTS_FILENAME = "DRIFTWATCH_ALERTS.md";

function severityRank(s: ExplainedConflict["explanation"]["severity"]): number {
  return s === "high" ? 3 : s === "medium" ? 2 : 1;
}

function formatAlertsMarkdown(worktreeLabel: "A" | "B", conflicts: ExplainedConflict[]): string {
  const relevant = conflicts.filter((c) => c.candidate.usedIn === worktreeLabel);

  if (relevant.length === 0) {
    return "# DriftWatch Alerts\n\nNo active conflicts detected affecting this worktree.\n";
  }

  const sorted = [...relevant].sort(
    (a, b) => severityRank(b.explanation.severity) - severityRank(a.explanation.severity)
  );

  const lines: string[] = [
    "# DriftWatch Alerts",
    "",
    "Conflicts detected between active worktrees. If you are an AI coding agent",
    "reading this, review HIGH severity items below before editing the files they mention.",
    "",
  ];

  for (const c of sorted) {
    lines.push(`## [${c.explanation.severity.toUpperCase()}] \`${c.candidate.symbolName}\``);
    lines.push("");
    lines.push(`- Changed in worktree ${c.candidate.changedIn}: \`${c.candidate.changedAt.filePath}\` (lines ${c.candidate.changedAt.startLine}-${c.candidate.changedAt.endLine})`);
    lines.push(`- Used here: \`${c.candidate.usageLocation.filePath}:${c.candidate.usageLocation.line}\``);
    lines.push("");
    lines.push(c.explanation.explanation);

    lines.push("");
  }

  return lines.join("\n");
}

// Fallback delivery for agents without a native hook system (Cursor, Codex,
// Devin, etc). Nothing forces an agent to read this, unlike the Claude Code
// hook — it's a real degradation path, not the primary mechanism.
export function writeFallbackAlerts(
  worktreeA: string,
  worktreeB: string,
  conflicts: ExplainedConflict[]
): void {
  const absoluteConflicts = conflicts.map(toAbsoluteConflict);

  for (const [worktree, label] of [
    [worktreeA, "A"],
    [worktreeB, "B"],
  ] as const) {
    writeFileSync(join(worktree, ALERTS_FILENAME), formatAlertsMarkdown(label, absoluteConflicts), "utf8");
  }
}