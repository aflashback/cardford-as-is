import { actionId } from '../../game/index.ts';
import { assertObservation,type SeatObservation } from '../../observations/index.ts';
import { buildDecisionRequest } from '../../providers/openrouter.ts';
import { providerEligibility } from '../../providers/eligibility.ts';
import { buildFacts } from '../../strategy/facts.ts';

/** New direct comparison arms. Legacy SG-06 J1 meanings remain frozen separately. */
export function buildDirectJevPacket(obs:SeatObservation,arm:'J0'|'J1') {
  assertObservation(obs);
  const eligibility=providerEligibility(obs);
  const base={schemaVersion:'direct-jev-packet-1.0.0',arm,promptVersion:`direct-jev-${arm.toLowerCase()}-1.0.0`,
    experimentId:null,dispatchAuthorized:false,observedModel:null,eligibility};
  if(eligibility.kind==='unsupported-action-space')return {...base,request:null};
  const request=buildDecisionRequest(obs,obs.legalActions.map(actionId));
  if(arm==='J0')return {...base,request};
  const facts=buildFacts(obs);
  // All fields are independently computed exact own/public facts. Neither a
  // local policy action nor hypotheses, scores, priorities or cue text enters.
  const exactFacts={
    ownSuitCounts:{...facts.suitLengths},
    publicVoids:{C:[...facts.voids.C],D:[...facts.voids.D],H:[...facts.voids.H],S:[...facts.voids.S]},
    legalCount:obs.legalActions.length,publicHistoryComplete:facts.knowledgeComplete,
    immediateCardOutcomes:facts.cardOutcomes.map(outcome=>({actionId:outcome.actionId,guaranteedWinner:outcome.guaranteedWinner})),
    limitations:'Guarantees concern legal responses using actor knowledge. No concealed ownership, sampled value or calibrated outcome forecast is supplied.',
  };
  return {...base,request:{...request,state:{...request.state,exactFacts}}};
}
