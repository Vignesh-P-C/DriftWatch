import { execFileSync } from "node:child_process";

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

export function getCurrentCommit(worktreePath: string): string {
  return git(["rev-parse", "HEAD"], worktreePath);
}

export function getMergeBase(worktreePath: string, commitA: string, commitB: string): string {
  return git(["merge-base", commitA, commitB], worktreePath);
}

export function getChangedFiles(worktreePath: string, fromCommit: string, toCommit: string): string[] {
  const output = git(["diff", "--name-only", fromCommit, toCommit], worktreePath);
  return output.length > 0 ? output.split("\n") : [];
}

export function getRawDiff(worktreePath: string, fromCommit: string, toCommit: string): string {
  return execFileSync("git", ["diff", "-U0", fromCommit, toCommit], {
    cwd: worktreePath,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  });
}

export function getWorkingTreeDiff(worktreePath: string, fromCommit: string): string {
  return execFileSync("git", ["diff", "-U0", fromCommit], {
    cwd: worktreePath,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  });
}