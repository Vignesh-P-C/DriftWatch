// src/agent/types.ts
import { ConflictCandidate } from "../detector/overlap.js";
import { ConflictExplanation } from "../reasoning/types.js";

export interface ExplainedConflict {
  candidate: ConflictCandidate;
  explanation: ConflictExplanation;
}

export interface DriftwatchState {
  generatedAt: string;      // ISO timestamp, so a hook can tell if state is stale
  worktreeA: string;
  worktreeB: string;
  conflicts: ExplainedConflict[];
}