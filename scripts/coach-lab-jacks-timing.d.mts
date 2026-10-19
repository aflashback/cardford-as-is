export function timingConfiguration(): { version: string; worldsPerStream: number; maxSamplerOperations: number; maxSteps: number; profiles: { id: string; policies: string[] }[] };
export function bindTimingCase(spec: any, manifest: any, decision: any): any;
export function readTimingDecision(path: string, decisionId: string): Promise<{ decision: any; archiveDigest: string; recordDigest: string | null; line: number }>;
export function verifyTimingArchiveBytes(spec: any, manifestBytes: Uint8Array, recordDigest: string | null): void;
export function summarizeTimingCase(c: any, referenceCandidateId: string): any;
export function assessTimingRun(input: any): 'passed' | 'pending-unverified';
export function main(args?: string[]): Promise<void>;
