import type { SeatObservation } from '../observations/index.ts';

export const PROVIDER_CANDIDATE_LIMIT=255;
export type ProviderEligibility =
  | {kind:'forced';legalCount:1;maxCandidates:number}
  | {kind:'supported';legalCount:number;maxCandidates:number}
  | {kind:'unsupported-action-space';legalCount:number;maxCandidates:number;reason:'no-legal-decision'|'choice-limit'};
/** Complete actor legal space only. Never silently shortlist an unsupported phase. */
export function providerEligibility(packet: Pick<SeatObservation,'legalActions'>):ProviderEligibility {
  const legalCount=packet.legalActions.length;
  if(legalCount===1)return {kind:'forced',legalCount:1,maxCandidates:PROVIDER_CANDIDATE_LIMIT};
  if(legalCount<1||legalCount>PROVIDER_CANDIDATE_LIMIT)return {
    kind:'unsupported-action-space',legalCount,maxCandidates:PROVIDER_CANDIDATE_LIMIT,
    reason:legalCount<1?'no-legal-decision':'choice-limit'};
  return {kind:'supported',legalCount,maxCandidates:PROVIDER_CANDIDATE_LIMIT};
}
