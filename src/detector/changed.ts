import { join } from "node:path";
import { extractSymbolsFromFile } from "../graph/builder.js";
import { SymbolGraph, addSymbol } from "../graph/types.js";
import { getRawDiff, getWorkingTreeDiff } from "./git.js";
import { parseDiffHunks, rangesOverlap } from "./diff.js";

const PARSEABLE_EXTENSIONS = new Set([".ts", ".tsx"]);

function getExtension(filePath: string): string {
  const idx = filePath.lastIndexOf(".");
  return idx === -1 ? "" : filePath.slice(idx);
}

export function buildChangedSymbolGraph(
  worktreePath: string,
  fromCommit: string,
  toCommit: string
): SymbolGraph {
  const graph: SymbolGraph = new Map();
  const rawDiff = getRawDiff(worktreePath, fromCommit, toCommit);
  const fileHunks = parseDiffHunks(rawDiff);

  for (const [relativeFilePath, hunks] of fileHunks) {
    if (!PARSEABLE_EXTENSIONS.has(getExtension(relativeFilePath))) continue;
    if (hunks.length === 0) continue;

    const fullPath = join(worktreePath, relativeFilePath);
    let symbols;
    try {
      symbols = extractSymbolsFromFile(fullPath);
    } catch {
      continue;
    }

    for (const symbol of symbols) {
      const symbolRange = { startLine: symbol.startLine, endLine: symbol.endLine };
      const touched = hunks.some((hunk) => rangesOverlap(symbolRange, hunk));
      if (touched) addSymbol(graph, symbol);
    }
  }

  return graph;
}

export function buildWorkingTreeChangedSymbolGraph(
  worktreePath: string,
  fromCommit: string
): SymbolGraph {
  const graph: SymbolGraph = new Map();
  const rawDiff = getWorkingTreeDiff(worktreePath, fromCommit);
  const fileHunks = parseDiffHunks(rawDiff);

  for (const [relativeFilePath, hunks] of fileHunks) {
    if (!PARSEABLE_EXTENSIONS.has(getExtension(relativeFilePath))) continue;
    if (hunks.length === 0) continue;

    const fullPath = join(worktreePath, relativeFilePath);
    let symbols;
    try {
      symbols = extractSymbolsFromFile(fullPath);
    } catch {
      continue;
    }

    for (const symbol of symbols) {
      const symbolRange = { startLine: symbol.startLine, endLine: symbol.endLine };
      const touched = hunks.some((hunk) => rangesOverlap(symbolRange, hunk));
      if (touched) addSymbol(graph, symbol);
    }
  }

  return graph;
}