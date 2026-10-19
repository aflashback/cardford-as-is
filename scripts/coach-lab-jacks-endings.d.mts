export interface EndingComparison {
  profileId: string; candidateId: string; allocations: number;
  meanObjectivePoints: number; meanOwnPoints: number; meanPartnerPoints: number | null;
  minimumDeltaPoints: number; maximumDeltaPoints: number; meanDeltaPoints: number;
  worse: number; equal: number; better: number; allFutureForced: boolean;
}
export interface EndingCaseSummary {
  id: string; variant: string; objective: string; status: string; allocations: number;
  referenceCandidateId: string; comparisons: EndingComparison[];
}
export function prepareEndingOutput(path: string, base?: string): string;
export function assessEndingRun(input: { build: { status: string } | null; invocation: { status: string } | null; sourceUnchanged: boolean; study: unknown }): 'passed' | 'pending-unverified';
export function summarizeEndingCase(input: unknown): EndingCaseSummary;
export function main(args?: string[]): Promise<void>;
