import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { writeState, getActiveConflictFor, writeFallbackAlerts } from "./adapter.js";
import { ExplainedConflict } from "./types.js";

// Real worktree paths are never used in tests — isolated temp dirs stand in
// for worktreeA/worktreeB so tests can't touch or depend on the real repo,
// and can run in parallel/CI without collisions.
let worktreeA: string;
let worktreeB: string;

beforeEach(() => {
  worktreeA = mkdtempSync(join(tmpdir(), "dw-a-"));
  worktreeB = mkdtempSync(join(tmpdir(), "dw-b-"));
});

afterEach(() => {
  rmSync(worktreeA, { recursive: true, force: true });
  rmSync(worktreeB, { recursive: true, force: true });
});

// Mirrors the real HIGH result from the project's own end-to-end scenario:
// add() gained a parameter, breaking a two-argument call site.
function makeHighConflict(): ExplainedConflict {
  return {
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
}

// Mirrors a real LOW result: signature unchanged, should never block.
function makeLowConflict(): ExplainedConflict {
  return {
    candidate: {
      symbolName: "watch",
      changedIn: "A",
      changedAt: { filePath: resolve(worktreeA, "src/watcher/index.ts"), startLine: 46, endLine: 72 },
      usedIn: "B",
      usageLocation: { name: "watch", filePath: resolve(worktreeB, "src/cli/index.ts"), line: 23 },
    },
    explanation: { severity: "low", explanation: "Call signature is unchanged and safe." },
  };
}

describe("writeState + getActiveConflictFor", () => {
  it("matches a file with a real HIGH conflict", () => {
    const high = makeHighConflict();
    writeState(worktreeA, worktreeB, [high]);

    const result = getActiveConflictFor(worktreeB, resolve(worktreeB, "src/graph/sample.ts"));
    expect(result).not.toBeNull();
    expect(result?.explanation.severity).toBe("high");
    expect(result?.candidate.symbolName).toBe("add");
  });

  it("does NOT match a file whose only conflict is LOW severity", () => {
    const low = makeLowConflict();
    writeState(worktreeA, worktreeB, [low]);

    const result = getActiveConflictFor(worktreeB, resolve(worktreeB, "src/cli/index.ts"));
    expect(result).toBeNull();
  });

  it("returns null for a file with no recorded conflict at all", () => {
    writeState(worktreeA, worktreeB, [makeHighConflict()]);

    const result = getActiveConflictFor(worktreeB, resolve(worktreeB, "package.json"));
    expect(result).toBeNull();
  });

  it("returns null when no state file has ever been written", () => {
    // No writeState() call at all — getActiveConflictFor must fail closed,
    // not throw, when .driftwatch/state.json doesn't exist yet.
    const result = getActiveConflictFor(worktreeB, resolve(worktreeB, "src/graph/sample.ts"));
    expect(result).toBeNull();
  });

  it("writes identical state to BOTH worktrees", () => {
    writeState(worktreeA, worktreeB, [makeHighConflict()]);

    const stateA = JSON.parse(readFileSync(join(worktreeA, ".driftwatch/state.json"), "utf8"));
    const stateB = JSON.parse(readFileSync(join(worktreeB, ".driftwatch/state.json"), "utf8"));
    expect(stateA.conflicts).toEqual(stateB.conflicts);
  });

  it("overwriting with an empty conflict list clears a previously active HIGH conflict", () => {
    // This is the exact scenario the code comment in watcher/index.ts calls out:
    // a stale HIGH conflict must stop blocking once it's actually resolved.
    writeState(worktreeA, worktreeB, [makeHighConflict()]);
    expect(getActiveConflictFor(worktreeB, resolve(worktreeB, "src/graph/sample.ts"))).not.toBeNull();

    writeState(worktreeA, worktreeB, []);
    expect(getActiveConflictFor(worktreeB, resolve(worktreeB, "src/graph/sample.ts"))).toBeNull();
  });
});

describe("writeFallbackAlerts", () => {
  it("writes a clean 'no conflicts' message when there are none", () => {
    writeFallbackAlerts(worktreeA, worktreeB, []);
    const alerts = readFileSync(join(worktreeA, "DRIFTWATCH_ALERTS.md"), "utf8");
    expect(alerts).toContain("No active conflicts detected");
  });

  it("writes only the conflicts relevant to each worktree's usedIn side", () => {
    writeFallbackAlerts(worktreeA, worktreeB, [makeHighConflict(), makeLowConflict()]);

    // Both conflicts are usedIn "B" in this fixture, so worktree A's alert file
    // should show neither despite being where the changes originated.
    const alertsA = readFileSync(join(worktreeA, "DRIFTWATCH_ALERTS.md"), "utf8");
    const alertsB = readFileSync(join(worktreeB, "DRIFTWATCH_ALERTS.md"), "utf8");

    expect(alertsA).toContain("No active conflicts detected");
    expect(alertsB).toContain("add");
    expect(alertsB).toContain("watch");
  });

  it("sorts HIGH severity above LOW in the alerts file", () => {
    writeFallbackAlerts(worktreeA, worktreeB, [makeLowConflict(), makeHighConflict()]);
    const alertsB = readFileSync(join(worktreeB, "DRIFTWATCH_ALERTS.md"), "utf8");

    const highIndex = alertsB.indexOf("[HIGH]");
    const lowIndex = alertsB.indexOf("[LOW]");
    expect(highIndex).toBeGreaterThanOrEqual(0);
    expect(lowIndex).toBeGreaterThan(highIndex);
  });

  it("creates .driftwatch/ and writes the alerts file even if neither existed before", () => {
    expect(existsSync(join(worktreeA, "DRIFTWATCH_ALERTS.md"))).toBe(false);
    writeFallbackAlerts(worktreeA, worktreeB, []);
    expect(existsSync(join(worktreeA, "DRIFTWATCH_ALERTS.md"))).toBe(true);
  });
});