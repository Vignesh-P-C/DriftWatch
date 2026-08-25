import { SymbolGraph } from "../graph/types.js";
import { findUsagesInWorktree, UsageLocation } from "../graph/usage.js";

export interface ConflictCandidate {
  symbolName: string;
  changedIn: "A" | "B";
  changedAt: { filePath: string; startLine: number; endLine: number };
  usedIn: "A" | "B";
  usageLocation: UsageLocation;
}

function detectOneDirection(
  changedGraph: SymbolGraph,
  changedLabel: "A" | "B",
  otherWorktreePath: string,
  otherLabel: "A" | "B"
): ConflictCandidate[] {
  const changedNames = [...changedGraph.keys()];
  if (changedNames.length === 0) return [];

  const usages = findUsagesInWorktree(otherWorktreePath, changedNames);
  const candidates: ConflictCandidate[] = [];

  for (const usage of usages) {
    const changedSymbols = changedGraph.get(usage.name);
    if (!changedSymbols) continue;

    for (const changedSymbol of changedSymbols) {
      candidates.push({
        symbolName: usage.name,
        changedIn: changedLabel,
        changedAt: {
          filePath: changedSymbol.filePath,
          startLine: changedSymbol.startLine,
          endLine: changedSymbol.endLine,
        },
        usedIn: otherLabel,
        usageLocation: usage,
      });
    }
  }

  return candidates;
}

export function detectConflicts(
  changedInA: SymbolGraph,
  changedInB: SymbolGraph,
  pathA: string,
  pathB: string
): ConflictCandidate[] {
  return [
    ...detectOneDirection(changedInA, "A", pathB, "B"),
    ...detectOneDirection(changedInB, "B", pathA, "A"),
  ];
}