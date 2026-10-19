export interface KingRunSummary {
  runId: string; variant: string; profileId: string; arm: string; witnessId: string | null;
  objectivePoints: number; kingNetPoints: number; kingPenaltyPoints: number; kingCaptor: number;
  doubled: boolean; kingWithheld: boolean; components: Record<string, number>;
}
export interface KingComparison { variant: string; profileId: string; natural: KingRunSummary; doubled: KingRunSummary; declined: KingRunSummary; doubleMinusDeclinePoints: number; doubleMinusDeclineKingNet: number }
export interface KingStudySummary { schemaVersion: string; status: string; fixtureCount: number; runs: number; steps: number; strengthClaim: false; promotionEligible: false; cases: { id: string; patternId: string; comparisons: KingComparison[]; witnesses: KingRunSummary[] }[] }
export function validateKingScenarioRun(input: unknown): KingRunSummary;
export function summarizeKingScenarioStudy(study: unknown, corpus: unknown): KingStudySummary;
export function assessKingScenarioRun(input: unknown): 'passed' | 'pending-unverified';
export function main(args?: string[]): Promise<void>;
