export interface KingDiscardInput { caseId: string; rulePin: Record<string, string>; observation: Record<string, unknown>; referenceCandidateId: string; alternativeCandidateId: string }
export interface KingDiscardConfiguration { worldsPerStream: number; maxSamplerOperations: number; maxSteps: number; profiles: { id: string; policies: string[] }[]; streams: string[] }
export interface KingDiscardComparison { profileId: string; candidateId: string; currentCandidateId: string; samples: number; meanTeamPoints: number; meanKingNetPoints: number; meanDeltaVsReference: number; meanDeltaVsCurrent: number; minimumDelta: number; maximumDelta: number; worse: number; equal: number; better: number; immediateReleases: number; opposingCaptures: number; firstTrickCaptorCounts: number[] }
export interface KingDiscardSummary { caseId: string; variant: string; status: string; sampledWorlds: number; uniqueAllocations: number; repeatedSamples: number; streams: { stream: string; comparisons: KingDiscardComparison[] }[] }
export function kingDiscardConfiguration(): KingDiscardConfiguration;
export function bindKingDiscardCase(variant: string, run: unknown): KingDiscardInput;
export function summarizeKingDiscardCase(result: unknown, input: KingDiscardInput, configuration: KingDiscardConfiguration): KingDiscardSummary;
export function assessKingDiscardRun(input: unknown): 'passed' | 'pending-unverified';
export function main(args?: string[]): Promise<void>;

export function verifyKingDiscardReceipt(receipt: unknown, before: Record<string, string>, after: Record<string, string>): void;
export function reportKingDiscard(cases: KingDiscardSummary[]): string;

