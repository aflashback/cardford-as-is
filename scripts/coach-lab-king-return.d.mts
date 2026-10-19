export interface KingReturnInput { caseId: string; rulePin: Record<string, string>; observation: Record<string, unknown>; referenceCandidateId: string; alternativeCandidateId: string }
export interface KingReturnConfiguration { worldsPerStream: number; maxSamplerOperations: number; maxSteps: number; profiles: { id: string; policies: string[] }[]; streams: string[] }
export interface KingReturnComparison { profileId: string; candidateId: string; currentCandidateId: string; samples: number; meanTeamPoints: number; meanKingNetPoints: number; meanDeltaVsReference: number; meanDeltaVsCurrent: number; minimumDelta: number; maximumDelta: number; worse: number; equal: number; better: number; immediateReleases: number; opposingCaptures: number }
export interface KingReturnSummary { caseId: string; variant: string; status: string; sampledWorlds: number; uniqueAllocations: number; repeatedSamples: number; streams: { stream: string; comparisons: KingReturnComparison[] }[] }
export function kingReturnConfiguration(): KingReturnConfiguration;
export function bindKingReturnCase(variant: string, run: unknown): KingReturnInput;
export function summarizeKingReturnCase(result: unknown, input: KingReturnInput, configuration: KingReturnConfiguration): KingReturnSummary;
export function assessKingReturnRun(input: unknown): 'passed' | 'pending-unverified';
export function main(args?: string[]): Promise<void>;
