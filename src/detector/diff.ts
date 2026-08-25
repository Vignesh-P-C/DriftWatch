export interface LineRange {
  startLine: number;
  endLine: number;
}

export type FileHunks = Map<string, LineRange[]>;

const FILE_HEADER_REGEX = /^\+\+\+ b\/(.+)$/;
const HUNK_HEADER_REGEX = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

export function parseDiffHunks(rawDiff: string): FileHunks {
  const result: FileHunks = new Map();
  let currentFile: string | null = null;

  for (const line of rawDiff.split("\n")) {
    const fileMatch = line.match(FILE_HEADER_REGEX);
    if (fileMatch) {
      currentFile = fileMatch[1];
      if (!result.has(currentFile)) result.set(currentFile, []);
      continue;
    }

    const hunkMatch = line.match(HUNK_HEADER_REGEX);
    if (hunkMatch && currentFile) {
      const startLine = parseInt(hunkMatch[1], 10);
      const count = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
      if (count === 0) continue; // pure deletion — nothing on the "new" side to flag
      result.get(currentFile)!.push({ startLine, endLine: startLine + count - 1 });
    }
  }

  return result;
}

export function rangesOverlap(a: LineRange, b: LineRange): boolean {
  return a.startLine <= b.endLine && b.startLine <= a.endLine;
}