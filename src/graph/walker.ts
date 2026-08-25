import { readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { parseFileIntoGraph } from "./builder.js";
import { SymbolGraph } from "./types.js";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "build"]);
const PARSEABLE_EXTENSIONS = new Set([".ts", ".tsx"]);

export function walkDirectory(dirPath: string, onFile: (filePath: string) => void): void {
  const entries = readdirSync(dirPath);

  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walkDirectory(fullPath, onFile);
    } else if (stats.isFile() && PARSEABLE_EXTENSIONS.has(extname(entry))) {
      onFile(fullPath);
    }
  }
}

export function buildGraphForWorktree(worktreePath: string): SymbolGraph {
  const graph: SymbolGraph = new Map();
  walkDirectory(worktreePath, (filePath) => {
    parseFileIntoGraph(filePath, graph);
  });
  return graph;
}