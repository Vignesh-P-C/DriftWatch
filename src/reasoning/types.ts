import { ConflictCandidate } from "../detector/overlap.js";

export type Severity = "low" | "medium" | "high";

export interface ConflictExplanation {
  severity: Severity;
  explanation: string;
}

export interface ReasoningProvider {
  explainConflict(candidate: ConflictCandidate): Promise<ConflictExplanation>;
}
