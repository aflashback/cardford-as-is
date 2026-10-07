/** Offline maintained definitions. A trigger is recognition, never an action proof. */
export interface CaseDefinition<O, A, Claim> {
  id: string; version: string; family: string;
  variants: readonly string[]; phases: readonly string[];
  summary: string; prerequisites: readonly string[];
  trigger(input: O): boolean;
  excluded(input: O): readonly string[];
  priority: number; conflictsWith: readonly string[];
  assess(input: O): {
    preferred: readonly A[]; reasonable: readonly A[];
    evidence: 'exact' | 'heuristic' | 'unsupported';
    claims: readonly Claim[]; limitations: readonly string[];
  };
  cue: { id: string; version: string };
  fixtures: readonly string[]; counterexamples: readonly string[];
  sources: readonly string[];
  review: 'hypothesis' | 'independently-reviewed' | 'contested';
}
